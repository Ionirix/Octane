import { Hono } from 'hono';
import type { Env } from '../../types/index.js';
import type { TrafficFlowSegment, TrafficIncident, TrafficRoadClass } from '../../modules/traffic/types.js';

export const trafficRouter = new Hono<{ Bindings: Env }>();

type ViewportBounds = {
  west: number
  south: number
  east: number
  north: number
}

type JsonObject = Record<string, unknown>

const HERE_FLOW_ENDPOINT = 'https://data.traffic.hereapi.com/v7/flow';
const HERE_INCIDENTS_ENDPOINT = 'https://data.traffic.hereapi.com/v7/incidents';
const FETCH_TIMEOUT_MS = 8000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function parseBbox(raw?: string): ViewportBounds | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined;

  let [west, south, east, north] = parts;
  if (west > east) [west, east] = [east, west];
  if (south > north) [south, north] = [north, south];

  return {
    west: wrapLongitude(west),
    south: clamp(south, -85, 85),
    east: wrapLongitude(east),
    north: clamp(north, -85, 85),
  };
}

function defaultBounds(): ViewportBounds {
  return { west: -122.8, south: 33.4, east: -116.4, north: 35.5 };
}

function toHereBounds(bounds: ViewportBounds): ViewportBounds {
  const maxSpan = 0.95;
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  const latHalf = Math.min((bounds.north - bounds.south) / 2, maxSpan / 2);
  const lngHalf = Math.min((bounds.east - bounds.west) / 2, maxSpan / 2);
  return {
    west: wrapLongitude(centerLng - lngHalf),
    south: clamp(centerLat - latHalf, -85, 85),
    east: wrapLongitude(centerLng + lngHalf),
    north: clamp(centerLat + latHalf, -85, 85),
  };
}

function roadClassForIndex(index: number): TrafficRoadClass {
  if (index % 4 === 0) return 'highway';
  if (index % 2 === 0) return 'arterial';
  return 'collector';
}

function roadFreeFlow(roadClass: TrafficRoadClass): number {
  if (roadClass === 'highway') return 108;
  if (roadClass === 'arterial') return 72;
  return 52;
}

function asObject(input: unknown): JsonObject | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as JsonObject;
}

function asArray<T>(input: unknown): T[] {
  if (!Array.isArray(input)) return [];
  return input as T[];
}

function finiteNumber(input: unknown): number | null {
  if (typeof input !== 'number' || !Number.isFinite(input)) return null;
  return input;
}

function averagePoint(points: Array<[number, number]>): { lat: number; lng: number } {
  const sum = points.reduce((acc, point) => {
    acc.lat += point[0];
    acc.lng += point[1];
    return acc;
  }, { lat: 0, lng: 0 });
  return {
    lat: Number((sum.lat / Math.max(points.length, 1)).toFixed(5)),
    lng: Number((sum.lng / Math.max(points.length, 1)).toFixed(5)),
  };
}

function pointsFromUnknown(input: unknown): Array<[number, number]> {
  if (!input) return [];

  if (Array.isArray(input)) {
    if (input.length > 0 && Array.isArray(input[0])) {
      return (input as unknown[])
        .map((entry) => {
          if (!Array.isArray(entry) || entry.length < 2) return null;
          const lat = Number(entry[0]);
          const lng = Number(entry[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return [lat, wrapLongitude(lng)] as [number, number];
        })
        .filter((entry): entry is [number, number] => Boolean(entry));
    }

    return (input as unknown[])
      .map((entry) => {
        const point = asObject(entry);
        if (!point) return null;
        const lat = finiteNumber(point.lat) ?? finiteNumber(point.latitude);
        const lng = finiteNumber(point.lng) ?? finiteNumber(point.lon) ?? finiteNumber(point.longitude);
        if (lat === null || lng === null) return null;
        return [lat, wrapLongitude(lng)] as [number, number];
      })
      .filter((entry): entry is [number, number] => Boolean(entry));
  }

  const pointObject = asObject(input);
  if (!pointObject) return [];

  const geometry = asObject(pointObject.geometry);
  const coordinates = asArray(geometry?.coordinates);
  if (coordinates.length > 1 && Array.isArray(coordinates[0])) {
    return coordinates
      .map((entry) => {
        if (!Array.isArray(entry) || entry.length < 2) return null;
        const lng = Number(entry[0]);
        const lat = Number(entry[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return [lat, wrapLongitude(lng)] as [number, number];
      })
      .filter((entry): entry is [number, number] => Boolean(entry));
  }

  const locationShape = asObject(asObject(pointObject.location)?.shape);
  const shapeObject = asObject(pointObject.shape);
  const links = asArray(locationShape?.links ?? shapeObject?.links);
  const linkPoints = links.flatMap((link) => pointsFromUnknown(asObject(link)?.points));
  if (linkPoints.length >= 2) return linkPoints;

  const points = pointsFromUnknown(pointObject.points ?? asObject(pointObject.location)?.points ?? asObject(pointObject.shape)?.points);
  if (points.length >= 2) return points;

  return [];
}

function signalAt(seed: number, phase: number): number {
  return (Math.sin(seed + phase) + Math.cos((seed * 0.7) - (phase * 0.8)) + 2) / 4;
}

function generateSyntheticSegments(bounds: ViewportBounds, timeIso: string): TrafficFlowSegment[] {
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  const latSpan = Math.max(0.16, bounds.north - bounds.south);
  const lngSpan = Math.max(0.18, bounds.east - bounds.west);
  const phase = new Date(timeIso).getTime() / 300000;
  const segments: TrafficFlowSegment[] = [];

  const majorOffsets = [-0.36, -0.14, 0.08, 0.29];
  majorOffsets.forEach((offset, index) => {
    const roadClass = roadClassForIndex(index);
    const freeFlowSpeedKph = roadFreeFlow(roadClass);
    const latBase = centerLat + (offset * latSpan);
    const points: Array<[number, number]> = Array.from({ length: 7 }, (_, pointIndex) => {
      const ratio = pointIndex / 6;
      const lng = bounds.west + (lngSpan * ratio);
      const curve = Math.sin((ratio * Math.PI * 1.8) + (index * 0.9)) * latSpan * 0.045;
      return [Number((latBase + curve).toFixed(5)), Number(wrapLongitude(lng).toFixed(5))];
    });
    const congestionIndex = clamp(signalAt(index + (centerLat * 0.3), phase) * 0.96, 0.08, 0.98);
    const currentSpeedKph = Math.max(8, Math.round(freeFlowSpeedKph * (1 - (congestionIndex * 0.72))));
    segments.push({
      id: `synthetic-h-${index}`,
      polyline: points,
      centroid: averagePoint(points),
      currentSpeedKph,
      freeFlowSpeedKph,
      congestionIndex: Number(congestionIndex.toFixed(3)),
      confidence: 0.68,
      roadClass,
      source: 'synthetic-traffic',
      updatedAt: timeIso,
      stale: false,
    });
  });

  majorOffsets.forEach((offset, index) => {
    const roadClass = index % 2 === 0 ? 'arterial' : 'collector';
    const freeFlowSpeedKph = roadFreeFlow(roadClass);
    const lngBase = centerLng + (offset * lngSpan);
    const points: Array<[number, number]> = Array.from({ length: 7 }, (_, pointIndex) => {
      const ratio = pointIndex / 6;
      const lat = bounds.south + (latSpan * ratio);
      const curve = Math.cos((ratio * Math.PI * 1.6) + (index * 0.6)) * lngSpan * 0.032;
      return [Number(lat.toFixed(5)), Number(wrapLongitude(lngBase + curve).toFixed(5))];
    });
    const congestionIndex = clamp(signalAt(4 + index + (centerLng * 0.12), phase + 0.6) * 0.88, 0.05, 0.94);
    const currentSpeedKph = Math.max(10, Math.round(freeFlowSpeedKph * (1 - (congestionIndex * 0.69))));
    segments.push({
      id: `synthetic-v-${index}`,
      polyline: points,
      centroid: averagePoint(points),
      currentSpeedKph,
      freeFlowSpeedKph,
      congestionIndex: Number(congestionIndex.toFixed(3)),
      confidence: 0.64,
      roadClass,
      source: 'synthetic-traffic',
      updatedAt: timeIso,
      stale: false,
    });
  });

  return segments;
}

function severityFromCongestion(congestionIndex: number): TrafficIncident['severity'] {
  if (congestionIndex >= 0.86) return 'CRITICAL';
  if (congestionIndex >= 0.74) return 'WARNING';
  return 'INFO';
}

function incidentsFromSegments(segments: TrafficFlowSegment[]): TrafficIncident[] {
  return [...segments]
    .filter((segment) => segment.congestionIndex >= 0.7)
    .sort((left, right) => right.congestionIndex - left.congestionIndex)
    .slice(0, 5)
    .map((segment, index) => ({
      id: `${segment.id}-incident-${index}`,
      type: 'traffic congestion',
      severity: severityFromCongestion(segment.congestionIndex),
      title: `Traffic congestion on ${segment.roadClass}`,
      description: `Observed ${Math.round(segment.congestionIndex * 100)}% congestion with speeds at ${segment.currentSpeedKph} kph versus ${segment.freeFlowSpeedKph} kph free-flow.`,
      lat: segment.centroid.lat,
      lng: segment.centroid.lng,
      roadClass: segment.roadClass,
      source: segment.source,
      updatedAt: segment.updatedAt,
      stale: segment.stale,
    }));
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`traffic upstream ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseHereFlowSegments(payload: unknown): TrafficFlowSegment[] {
  const root = asObject(payload);
  const results = asArray(root?.results ?? asObject(root?.data)?.results ?? root?.segments ?? root?.flowSegments);

  return results
    .map<TrafficFlowSegment | null>((entry, index) => {
      const item = asObject(entry);
      if (!item) return null;
      const polyline = pointsFromUnknown(item.location ?? item.shape ?? item.geometry ?? item.polyline ?? item.points);
      if (polyline.length < 2) return null;

      const jamFactor = finiteNumber(item.jamFactor) ?? finiteNumber(item.congestionIndex) ?? finiteNumber(asObject(item.currentFlow)?.jamFactor) ?? 0.25;
      const roadClass = (typeof item.functionalClass === 'string' && item.functionalClass.includes('1')) || item.roadClass === 'highway'
        ? 'highway'
        : (typeof item.functionalClass === 'string' && item.functionalClass.includes('2')) || item.roadClass === 'arterial'
          ? 'arterial'
          : 'collector';
      const freeFlowSpeedKph = Math.round(
        finiteNumber(item.freeFlowSpeed) ?? finiteNumber(asObject(item.currentFlow)?.freeFlowSpeed) ?? roadFreeFlow(roadClass),
      );
      const currentSpeedKph = Math.round(
        finiteNumber(item.speed) ?? finiteNumber(item.currentSpeed) ?? finiteNumber(asObject(item.currentFlow)?.speed) ?? (freeFlowSpeedKph * (1 - (jamFactor * 0.6))),
      );
      const segment: TrafficFlowSegment = {
        id: String(item.id ?? `here-flow-${index}`),
        polyline,
        centroid: averagePoint(polyline),
        currentSpeedKph: Math.max(5, currentSpeedKph),
        freeFlowSpeedKph: Math.max(currentSpeedKph, freeFlowSpeedKph),
        congestionIndex: Number(clamp(jamFactor, 0, 1).toFixed(3)),
        confidence: Number((finiteNumber(item.confidence) ?? 0.92).toFixed(3)),
        roadClass,
        source: 'here-traffic',
        updatedAt: new Date().toISOString(),
        stale: false,
      };
      return segment;
    })
    .filter((entry): entry is TrafficFlowSegment => Boolean(entry));
}

function parseHereIncidents(payload: unknown): TrafficIncident[] {
  const root = asObject(payload);
  const results = asArray(root?.results ?? asObject(root?.data)?.results ?? root?.incidents);

  return results
    .map<TrafficIncident | null>((entry, index) => {
      const item = asObject(entry);
      if (!item) return null;
      const point = pointsFromUnknown(item.location ?? item.geometry ?? item.polyline ?? item.points)[0]
        ?? (() => {
          const location = asObject(item.location);
          const lat = finiteNumber(location?.lat) ?? finiteNumber(item.lat);
          const lng = finiteNumber(location?.lng) ?? finiteNumber(location?.lon) ?? finiteNumber(item.lng) ?? finiteNumber(item.lon);
          if (lat === null || lng === null) return null;
          return [lat, wrapLongitude(lng)] as [number, number];
        })();
      if (!point) return null;

      const descriptionObject = asObject(item.description);
      const severityValue = String(item.severity ?? item.criticality ?? item.priority ?? '').toLowerCase();
      const severity: TrafficIncident['severity'] = severityValue.includes('critical') || severityValue.includes('major')
        ? 'CRITICAL'
        : severityValue.includes('minor') || severityValue.includes('warning')
          ? 'WARNING'
          : 'INFO';
      const roadClass = item.roadClass === 'highway' || item.functionalClass === '1'
        ? 'highway'
        : item.roadClass === 'arterial' || item.functionalClass === '2'
          ? 'arterial'
          : 'collector';

      const incident: TrafficIncident = {
        id: String(item.id ?? `here-incident-${index}`),
        type: String(item.type ?? item.incidentType ?? 'traffic incident'),
        severity,
        title: String(descriptionObject?.value ?? item.title ?? item.summary ?? 'Traffic incident'),
        description: String(descriptionObject?.value ?? item.description ?? item.details ?? 'Traffic disruption detected.'),
        lat: point[0],
        lng: point[1],
        roadClass,
        source: 'here-traffic',
        updatedAt: new Date().toISOString(),
        stale: false,
      };
      return incident;
    })
    .filter((entry): entry is TrafficIncident => Boolean(entry));
}

async function loadFlowSegments(bounds: ViewportBounds, apiKey?: string): Promise<{ provider: string; stale: boolean; segments: TrafficFlowSegment[] }> {
  const timeIso = new Date().toISOString();
  if (!apiKey) {
    return { provider: 'synthetic', stale: false, segments: generateSyntheticSegments(bounds, timeIso) };
  }

  try {
    const requestBounds = toHereBounds(bounds);
    const url = new URL(HERE_FLOW_ENDPOINT);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('in', `bbox:${requestBounds.west},${requestBounds.south},${requestBounds.east},${requestBounds.north}`);
    url.searchParams.set('locationReferencing', 'shape');
    url.searchParams.set('units', 'metric');
    const payload = await fetchJsonWithTimeout(url.toString());
    const segments = parseHereFlowSegments(payload);
    if (segments.length > 0) return { provider: 'here', stale: false, segments };
  } catch {
    // Fall back below.
  }

  return { provider: 'synthetic', stale: false, segments: generateSyntheticSegments(bounds, timeIso) };
}

async function loadTrafficIncidents(bounds: ViewportBounds, apiKey: string | undefined, fallbackSegments: TrafficFlowSegment[]): Promise<{ provider: string; stale: boolean; incidents: TrafficIncident[] }> {
  if (!apiKey) {
    return { provider: 'synthetic', stale: false, incidents: incidentsFromSegments(fallbackSegments) };
  }

  try {
    const requestBounds = toHereBounds(bounds);
    const url = new URL(HERE_INCIDENTS_ENDPOINT);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('in', `bbox:${requestBounds.west},${requestBounds.south},${requestBounds.east},${requestBounds.north}`);
    url.searchParams.set('locationReferencing', 'shape');
    const payload = await fetchJsonWithTimeout(url.toString());
    const incidents = parseHereIncidents(payload);
    if (incidents.length > 0) return { provider: 'here', stale: false, incidents };
  } catch {
    // Fall back below.
  }

  return { provider: 'synthetic', stale: false, incidents: incidentsFromSegments(fallbackSegments) };
}

trafficRouter.get('/flow', async (c) => {
  const bounds = parseBbox(c.req.query('bbox')) ?? defaultBounds();
  const flow = await loadFlowSegments(bounds, c.env.HERE_TRAFFIC_API_KEY);
  return c.json({
    ok: true,
    data: {
      provider: flow.provider,
      stale: flow.stale,
      updatedAt: new Date().toISOString(),
      segments: flow.segments,
    },
  });
});

trafficRouter.get('/incidents', async (c) => {
  const bounds = parseBbox(c.req.query('bbox')) ?? defaultBounds();
  const flow = await loadFlowSegments(bounds, c.env.HERE_TRAFFIC_API_KEY);
  const incidents = await loadTrafficIncidents(bounds, c.env.HERE_TRAFFIC_API_KEY, flow.segments);
  return c.json({
    ok: true,
    data: {
      provider: incidents.provider,
      stale: incidents.stale,
      updatedAt: new Date().toISOString(),
      incidents: incidents.incidents,
    },
  });
});

export default trafficRouter;