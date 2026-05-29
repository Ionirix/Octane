import { Hono, type Context } from 'hono';
import type { Env } from '../../types/index.js';
import { now, traceId } from '../../utils/helpers.js';
import { runSelfHealingCycle, type DisturbanceSignal } from '../../modules/self-healing/protocol.js';
import { executeOperationViaControlPlane } from '../../modules/self-healing/control-plane.js';

type PeaceMarkerRecord = {
  marker: string;
  createdAt: number;
  source: string;
  disturbanceType: string;
  modality: string;
  converged: boolean;
  triggerAlertId?: string;
  summary: string;
};

const MARKER_PREFIX = 'self-healing:peace-marker:';
const OPERATION_PREFIX = 'self-healing:operation:';
const HEALTH_NODE_ROTATION_MS = 14_000;
const ACTIVE_HEALTH_NODE_COUNT = 9;
const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

type HealthNodeTier = 'town' | 'city' | 'metropolis';

type HealthNodeLocation = {
  id: string;
  name: string;
  country: string;
  tier: HealthNodeTier;
  lat: number;
  lng: number;
  repairRadiusKm: number;
};

type ActiveHealthNode = HealthNodeLocation & {
  mission: string;
  activeSince: number;
  capability: 'dns-reconcile' | 'route-failover' | 'edge-capacity-shift' | 'incident-isolation' | 'cell-tower-recovery' | 'cell-activity-rebalance';
};

type HealingPlaybook = {
  id: string;
  title: string;
  summary: string;
  trigger: string;
  actions: string[];
  requiresApproval: true;
};

type OperationRecord = {
  id: string;
  createdAt: number;
  nodeId: string;
  nodeName: string;
  playbookId: string;
  playbookTitle: string;
  status: 'planned' | 'awaiting_approval' | 'approved' | 'executing' | 'succeeded' | 'failed' | 'rolled_back';
  reason: string;
  actions: string[];
  guardrail: string;
  runMarker: string;
  dryRun: boolean;
  approvedBy?: string;
  approvedAt?: number;
  executedBy?: string;
  executedAt?: number;
  completedAt?: number;
  rollbackAt?: number;
  verification?: {
    checks: Array<{ id: string; ok: boolean; note: string }>;
    summary: string;
  };
  controlPlane?: {
    ok: boolean;
    results: Array<{ domain: string; ok: boolean; statusCode?: number; detail: string }>;
  };
  error?: string;
};

const HEALTH_NODE_LOCATIONS: HealthNodeLocation[] = [
  { id: 'hn-town-reykjavik', name: 'Reykjavik', country: 'Iceland', tier: 'town', lat: 64.1466, lng: -21.9426, repairRadiusKm: 220 },
  { id: 'hn-town-bergen', name: 'Bergen', country: 'Norway', tier: 'town', lat: 60.3913, lng: 5.3221, repairRadiusKm: 260 },
  { id: 'hn-town-curitiba', name: 'Curitiba', country: 'Brazil', tier: 'town', lat: -25.4290, lng: -49.2671, repairRadiusKm: 300 },
  { id: 'hn-town-port-louis', name: 'Port Louis', country: 'Mauritius', tier: 'town', lat: -20.1609, lng: 57.5012, repairRadiusKm: 180 },
  { id: 'hn-town-faro', name: 'Faro', country: 'Portugal', tier: 'town', lat: 37.0194, lng: -7.9322, repairRadiusKm: 210 },
  { id: 'hn-town-hobart', name: 'Hobart', country: 'Australia', tier: 'town', lat: -42.8821, lng: 147.3272, repairRadiusKm: 260 },
  { id: 'hn-town-ushuaia', name: 'Ushuaia', country: 'Argentina', tier: 'town', lat: -54.8019, lng: -68.3030, repairRadiusKm: 240 },
  { id: 'hn-town-galway', name: 'Galway', country: 'Ireland', tier: 'town', lat: 53.2707, lng: -9.0568, repairRadiusKm: 220 },
  { id: 'hn-town-queenstown', name: 'Queenstown', country: 'New Zealand', tier: 'town', lat: -45.0312, lng: 168.6626, repairRadiusKm: 250 },
  { id: 'hn-town-nuuk', name: 'Nuuk', country: 'Greenland', tier: 'town', lat: 64.1814, lng: -51.6941, repairRadiusKm: 280 },
  { id: 'hn-town-bozeman', name: 'Bozeman', country: 'United States', tier: 'town', lat: 45.6770, lng: -111.0429, repairRadiusKm: 230 },
  { id: 'hn-town-asheville', name: 'Asheville', country: 'United States', tier: 'town', lat: 35.5951, lng: -82.5515, repairRadiusKm: 220 },
  { id: 'hn-town-bend', name: 'Bend', country: 'United States', tier: 'town', lat: 44.0582, lng: -121.3153, repairRadiusKm: 220 },
  { id: 'hn-town-santa-fe', name: 'Santa Fe', country: 'United States', tier: 'town', lat: 35.6870, lng: -105.9378, repairRadiusKm: 230 },
  { id: 'hn-town-burlington-vt', name: 'Burlington', country: 'United States', tier: 'town', lat: 44.4759, lng: -73.2121, repairRadiusKm: 210 },
  { id: 'hn-town-sucre', name: 'Sucre', country: 'Bolivia', tier: 'town', lat: -19.0196, lng: -65.2619, repairRadiusKm: 220 },
  { id: 'hn-town-invercargill', name: 'Invercargill', country: 'New Zealand', tier: 'town', lat: -46.4132, lng: 168.3538, repairRadiusKm: 240 },
  { id: 'hn-town-kangerlussuaq', name: 'Kangerlussuaq', country: 'Greenland', tier: 'town', lat: 67.0122, lng: -50.7116, repairRadiusKm: 260 },
  { id: 'hn-city-anchorage', name: 'Anchorage', country: 'United States', tier: 'city', lat: 61.2181, lng: -149.9003, repairRadiusKm: 520 },
  { id: 'hn-city-toronto', name: 'Toronto', country: 'Canada', tier: 'city', lat: 43.6532, lng: -79.3832, repairRadiusKm: 680 },
  { id: 'hn-city-madrid', name: 'Madrid', country: 'Spain', tier: 'city', lat: 40.4168, lng: -3.7038, repairRadiusKm: 710 },
  { id: 'hn-city-nairobi', name: 'Nairobi', country: 'Kenya', tier: 'city', lat: -1.2921, lng: 36.8219, repairRadiusKm: 640 },
  { id: 'hn-city-lima', name: 'Lima', country: 'Peru', tier: 'city', lat: -12.0464, lng: -77.0428, repairRadiusKm: 690 },
  { id: 'hn-city-auckland', name: 'Auckland', country: 'New Zealand', tier: 'city', lat: -36.8485, lng: 174.7633, repairRadiusKm: 670 },
  { id: 'hn-city-vancouver', name: 'Vancouver', country: 'Canada', tier: 'city', lat: 49.2827, lng: -123.1207, repairRadiusKm: 700 },
  { id: 'hn-city-casablanca', name: 'Casablanca', country: 'Morocco', tier: 'city', lat: 33.5731, lng: -7.5898, repairRadiusKm: 660 },
  { id: 'hn-city-santiago', name: 'Santiago', country: 'Chile', tier: 'city', lat: -33.4489, lng: -70.6693, repairRadiusKm: 710 },
  { id: 'hn-city-helsinki', name: 'Helsinki', country: 'Finland', tier: 'city', lat: 60.1699, lng: 24.9384, repairRadiusKm: 630 },
  { id: 'hn-city-kuala-lumpur', name: 'Kuala Lumpur', country: 'Malaysia', tier: 'city', lat: 3.1390, lng: 101.6869, repairRadiusKm: 740 },
  { id: 'hn-city-johannesburg', name: 'Johannesburg', country: 'South Africa', tier: 'city', lat: -26.2041, lng: 28.0473, repairRadiusKm: 760 },
  { id: 'hn-city-phoenix', name: 'Phoenix', country: 'United States', tier: 'city', lat: 33.4484, lng: -112.0740, repairRadiusKm: 700 },
  { id: 'hn-city-denver', name: 'Denver', country: 'United States', tier: 'city', lat: 39.7392, lng: -104.9903, repairRadiusKm: 710 },
  { id: 'hn-city-san-diego', name: 'San Diego', country: 'United States', tier: 'city', lat: 32.7157, lng: -117.1611, repairRadiusKm: 690 },
  { id: 'hn-city-charlotte', name: 'Charlotte', country: 'United States', tier: 'city', lat: 35.2271, lng: -80.8431, repairRadiusKm: 680 },
  { id: 'hn-city-orlando', name: 'Orlando', country: 'United States', tier: 'city', lat: 28.5383, lng: -81.3792, repairRadiusKm: 670 },
  { id: 'hn-city-detroit', name: 'Detroit', country: 'United States', tier: 'city', lat: 42.3314, lng: -83.0458, repairRadiusKm: 700 },
  { id: 'hn-city-minneapolis', name: 'Minneapolis', country: 'United States', tier: 'city', lat: 44.9778, lng: -93.2650, repairRadiusKm: 710 },
  { id: 'hn-city-kansas-city', name: 'Kansas City', country: 'United States', tier: 'city', lat: 39.0997, lng: -94.5786, repairRadiusKm: 700 },
  { id: 'hn-city-accra', name: 'Accra', country: 'Ghana', tier: 'city', lat: 5.6037, lng: -0.1870, repairRadiusKm: 660 },
  { id: 'hn-city-addis-ababa', name: 'Addis Ababa', country: 'Ethiopia', tier: 'city', lat: 8.9806, lng: 38.7578, repairRadiusKm: 680 },
  { id: 'hn-city-almaty', name: 'Almaty', country: 'Kazakhstan', tier: 'city', lat: 43.2220, lng: 76.8512, repairRadiusKm: 720 },
  { id: 'hn-city-honolulu', name: 'Honolulu', country: 'United States', tier: 'city', lat: 21.3069, lng: -157.8583, repairRadiusKm: 740 },
  { id: 'hn-metro-new-york', name: 'New York', country: 'United States', tier: 'metropolis', lat: 40.7128, lng: -74.0060, repairRadiusKm: 1200 },
  { id: 'hn-metro-los-angeles', name: 'Los Angeles', country: 'United States', tier: 'metropolis', lat: 34.0522, lng: -118.2437, repairRadiusKm: 1180 },
  { id: 'hn-metro-mexico-city', name: 'Mexico City', country: 'Mexico', tier: 'metropolis', lat: 19.4326, lng: -99.1332, repairRadiusKm: 1050 },
  { id: 'hn-metro-sao-paulo', name: 'Sao Paulo', country: 'Brazil', tier: 'metropolis', lat: -23.5558, lng: -46.6396, repairRadiusKm: 1220 },
  { id: 'hn-metro-london', name: 'London', country: 'United Kingdom', tier: 'metropolis', lat: 51.5074, lng: -0.1278, repairRadiusKm: 1140 },
  { id: 'hn-metro-paris', name: 'Paris', country: 'France', tier: 'metropolis', lat: 48.8566, lng: 2.3522, repairRadiusKm: 1160 },
  { id: 'hn-metro-lagos', name: 'Lagos', country: 'Nigeria', tier: 'metropolis', lat: 6.5244, lng: 3.3792, repairRadiusKm: 1040 },
  { id: 'hn-metro-cairo', name: 'Cairo', country: 'Egypt', tier: 'metropolis', lat: 30.0444, lng: 31.2357, repairRadiusKm: 1010 },
  { id: 'hn-metro-mumbai', name: 'Mumbai', country: 'India', tier: 'metropolis', lat: 19.0760, lng: 72.8777, repairRadiusKm: 1240 },
  { id: 'hn-metro-delhi', name: 'Delhi', country: 'India', tier: 'metropolis', lat: 28.6139, lng: 77.2090, repairRadiusKm: 1260 },
  { id: 'hn-metro-bangkok', name: 'Bangkok', country: 'Thailand', tier: 'metropolis', lat: 13.7563, lng: 100.5018, repairRadiusKm: 1090 },
  { id: 'hn-metro-tokyo', name: 'Tokyo', country: 'Japan', tier: 'metropolis', lat: 35.6762, lng: 139.6503, repairRadiusKm: 1280 },
  { id: 'hn-metro-seoul', name: 'Seoul', country: 'South Korea', tier: 'metropolis', lat: 37.5665, lng: 126.9780, repairRadiusKm: 1100 },
  { id: 'hn-metro-shanghai', name: 'Shanghai', country: 'China', tier: 'metropolis', lat: 31.2304, lng: 121.4737, repairRadiusKm: 1270 },
  { id: 'hn-metro-jakarta', name: 'Jakarta', country: 'Indonesia', tier: 'metropolis', lat: -6.2088, lng: 106.8456, repairRadiusKm: 1110 },
  { id: 'hn-metro-sydney', name: 'Sydney', country: 'Australia', tier: 'metropolis', lat: -33.8688, lng: 151.2093, repairRadiusKm: 1190 },
  { id: 'hn-metro-san-francisco', name: 'San Francisco', country: 'United States', tier: 'metropolis', lat: 37.7749, lng: -122.4194, repairRadiusKm: 1130 },
  { id: 'hn-metro-chicago', name: 'Chicago', country: 'United States', tier: 'metropolis', lat: 41.8781, lng: -87.6298, repairRadiusKm: 1170 },
  { id: 'hn-metro-buenos-aires', name: 'Buenos Aires', country: 'Argentina', tier: 'metropolis', lat: -34.6037, lng: -58.3816, repairRadiusKm: 1180 },
  { id: 'hn-metro-amsterdam', name: 'Amsterdam', country: 'Netherlands', tier: 'metropolis', lat: 52.3676, lng: 4.9041, repairRadiusKm: 1080 },
  { id: 'hn-metro-berlin', name: 'Berlin', country: 'Germany', tier: 'metropolis', lat: 52.5200, lng: 13.4050, repairRadiusKm: 1100 },
  { id: 'hn-metro-dubai', name: 'Dubai', country: 'United Arab Emirates', tier: 'metropolis', lat: 25.2048, lng: 55.2708, repairRadiusKm: 1150 },
  { id: 'hn-metro-karachi', name: 'Karachi', country: 'Pakistan', tier: 'metropolis', lat: 24.8607, lng: 67.0011, repairRadiusKm: 1210 },
  { id: 'hn-metro-dhaka', name: 'Dhaka', country: 'Bangladesh', tier: 'metropolis', lat: 23.8103, lng: 90.4125, repairRadiusKm: 1200 },
  { id: 'hn-metro-manila', name: 'Manila', country: 'Philippines', tier: 'metropolis', lat: 14.5995, lng: 120.9842, repairRadiusKm: 1170 },
  { id: 'hn-metro-beijing', name: 'Beijing', country: 'China', tier: 'metropolis', lat: 39.9042, lng: 116.4074, repairRadiusKm: 1290 },
  { id: 'hn-metro-singapore', name: 'Singapore', country: 'Singapore', tier: 'metropolis', lat: 1.3521, lng: 103.8198, repairRadiusKm: 1080 },
  { id: 'hn-metro-melbourne', name: 'Melbourne', country: 'Australia', tier: 'metropolis', lat: -37.8136, lng: 144.9631, repairRadiusKm: 1180 },
  { id: 'hn-metro-johannesburg-metro', name: 'Johannesburg Metro', country: 'South Africa', tier: 'metropolis', lat: -26.2041, lng: 28.0473, repairRadiusKm: 1120 },
  { id: 'hn-metro-lima-metro', name: 'Lima Metro', country: 'Peru', tier: 'metropolis', lat: -12.0464, lng: -77.0428, repairRadiusKm: 1120 },
  { id: 'hn-metro-reykjavik-metro', name: 'Reykjavik Metro', country: 'Iceland', tier: 'metropolis', lat: 64.1466, lng: -21.9426, repairRadiusKm: 1020 },
  { id: 'hn-metro-hanoi-metro', name: 'Hanoi Metro', country: 'Vietnam', tier: 'metropolis', lat: 21.0278, lng: 105.8342, repairRadiusKm: 1110 },
  { id: 'hn-metro-hong-kong-metro', name: 'Hong Kong Metro', country: 'China', tier: 'metropolis', lat: 22.3193, lng: 114.1694, repairRadiusKm: 1100 },
  { id: 'hn-metro-philadelphia', name: 'Philadelphia', country: 'United States', tier: 'metropolis', lat: 39.9526, lng: -75.1652, repairRadiusKm: 1110 },
  { id: 'hn-metro-houston', name: 'Houston', country: 'United States', tier: 'metropolis', lat: 29.7604, lng: -95.3698, repairRadiusKm: 1160 },
  { id: 'hn-metro-dallas', name: 'Dallas Metro', country: 'United States', tier: 'metropolis', lat: 32.7767, lng: -96.7970, repairRadiusKm: 1140 },
  { id: 'hn-metro-miami', name: 'Miami Metro', country: 'United States', tier: 'metropolis', lat: 25.7617, lng: -80.1918, repairRadiusKm: 1090 },
  { id: 'hn-metro-seattle', name: 'Seattle Metro', country: 'United States', tier: 'metropolis', lat: 47.6062, lng: -122.3321, repairRadiusKm: 1130 },
  { id: 'hn-metro-boston', name: 'Boston Metro', country: 'United States', tier: 'metropolis', lat: 42.3601, lng: -71.0589, repairRadiusKm: 1080 },
  { id: 'hn-metro-washington-dc', name: 'Washington DC Metro', country: 'United States', tier: 'metropolis', lat: 38.9072, lng: -77.0369, repairRadiusKm: 1080 },
  { id: 'hn-metro-las-vegas', name: 'Las Vegas Metro', country: 'United States', tier: 'metropolis', lat: 36.1699, lng: -115.1398, repairRadiusKm: 1090 },
];

function rotateTier(pool: HealthNodeLocation[], start: number, count: number, activeSince: number): ActiveHealthNode[] {
  if (pool.length === 0 || count <= 0) return [];
  const capabilities: ActiveHealthNode['capability'][] = [
    'dns-reconcile',
    'route-failover',
    'edge-capacity-shift',
    'incident-isolation',
    'cell-tower-recovery',
    'cell-activity-rebalance',
  ];
  const active: ActiveHealthNode[] = [];
  for (let index = 0; index < count; index += 1) {
    const node = pool[(start + index) % pool.length];
    const capability = capabilities[(start + index) % capabilities.length];
    active.push({
      ...node,
      mission: `SELF-HEALING INTERNET REPAIR · ${capability.toUpperCase()}`,
      activeSince,
      capability,
    });
  }
  return active;
}

function getActiveHealthNodes(at = Date.now()): ActiveHealthNode[] {
  const cycle = Math.floor(at / HEALTH_NODE_ROTATION_MS);
  const activeSince = at - ((cycle % 5) * 20_000);
  const byTier = {
    town: HEALTH_NODE_LOCATIONS.filter((node) => node.tier === 'town').sort((a, b) => a.name.localeCompare(b.name)),
    city: HEALTH_NODE_LOCATIONS.filter((node) => node.tier === 'city').sort((a, b) => a.name.localeCompare(b.name)),
    metropolis: HEALTH_NODE_LOCATIONS.filter((node) => node.tier === 'metropolis').sort((a, b) => a.name.localeCompare(b.name)),
  };

  const starts = {
    metropolis: byTier.metropolis.length > 0 ? cycle % byTier.metropolis.length : 0,
    city: byTier.city.length > 0 ? (cycle * 2) % byTier.city.length : 0,
    town: byTier.town.length > 0 ? (cycle * 3) % byTier.town.length : 0,
  };

  const active = [
    ...rotateTier(byTier.metropolis, starts.metropolis, 4, activeSince),
    ...rotateTier(byTier.city, starts.city, 3, activeSince),
    ...rotateTier(byTier.town, starts.town, 2, activeSince),
  ];

  return active.slice(0, ACTIVE_HEALTH_NODE_COUNT);
}

async function getRecentOperations(env: Env, limit: number): Promise<OperationRecord[]> {
  const boundedLimit = Math.max(1, Math.min(50, limit));
  const listing = await env.OPERATOR_STATE_KV.list({
    prefix: OPERATION_PREFIX,
    limit: boundedLimit,
  });

  const records = await Promise.all(
    listing.keys.map(async (entry) => {
      const raw = await env.OPERATOR_STATE_KV.get(entry.name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as OperationRecord;
      } catch {
        return null;
      }
    }),
  );

  return records
    .filter((entry): entry is OperationRecord => Boolean(entry))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, boundedLimit);
}

function operationStorageKey(id: string): string {
  return `${OPERATION_PREFIX}${id}`;
}

async function putOperation(env: Env, operation: OperationRecord): Promise<void> {
  await env.OPERATOR_STATE_KV.put(operationStorageKey(operation.id), JSON.stringify(operation));
}

async function getOperationById(env: Env, id: string): Promise<OperationRecord | null> {
  const raw = await env.OPERATOR_STATE_KV.get(operationStorageKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OperationRecord;
  } catch {
    return null;
  }
}

function normalizeActor(input: string | undefined, fallback: string): string {
  const value = (input ?? '').trim();
  if (!value) return fallback;
  return value.slice(0, 120);
}

function encodeUtf8(value: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encodeUtf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encodeUtf8(message));
  return toHex(signature);
}

async function requireSignedRole(
  c: Context<{ Bindings: Env }>,
  allowedRoles: string[],
): Promise<{ ok: true; actor: string; role: string } | { ok: false; response: Response }> {
  const secret = c.env.SELF_HEALING_SIGNING_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: c.json({ success: false, error: 'SELF_HEALING_SIGNING_SECRET is not configured', traceId: traceId(), timestamp: now() }, 503),
    };
  }

  const actor = (c.req.header('x-octane-actor') ?? '').trim();
  const role = (c.req.header('x-octane-role') ?? '').trim().toLowerCase();
  const timestampHeader = (c.req.header('x-octane-ts') ?? '').trim();
  const providedSignature = (c.req.header('x-octane-sig') ?? '').trim().toLowerCase();

  if (!actor || !role || !timestampHeader || !providedSignature) {
    return {
      ok: false,
      response: c.json({ success: false, error: 'missing signed RBAC headers', traceId: traceId(), timestamp: now() }, 401),
    };
  }

  if (!allowedRoles.includes(role)) {
    return {
      ok: false,
      response: c.json({ success: false, error: `role ${role} is not permitted`, traceId: traceId(), timestamp: now() }, 403),
    };
  }

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_MAX_SKEW_MS) {
    return {
      ok: false,
      response: c.json({ success: false, error: 'signature timestamp outside allowed window', traceId: traceId(), timestamp: now() }, 401),
    };
  }

  const message = `${c.req.method}\n${new URL(c.req.url).pathname}\n${timestampHeader}\n${actor}\n${role}`;
  const expectedSignature = await hmacSha256Hex(secret, message);
  if (providedSignature !== expectedSignature) {
    return {
      ok: false,
      response: c.json({ success: false, error: 'invalid signature', traceId: traceId(), timestamp: now() }, 401),
    };
  }

  return { ok: true, actor, role };
}

async function readSurveillancePosture(env: Env): Promise<{ activeAlerts: number; criticalAlerts: number; degradedNodes: number; onlineNodes: number } | null> {
  try {
    const stub = env.SURVEILLANCE_DO.get(env.SURVEILLANCE_DO.idFromName('global'));
    const [alertsRes, snapshotRes] = await Promise.all([
      stub.fetch('http://do/surveillance/alerts?onlyActive=true'),
      stub.fetch('http://do/surveillance/snapshot'),
    ]);

    const alertsPayload = await alertsRes.json() as { data?: Array<{ severity?: string }> };
    const snapshotPayload = await snapshotRes.json() as { data?: { onlineNodes?: number; degradedNodes?: number } };

    const alerts = alertsPayload.data ?? [];
    const criticalAlerts = alerts.filter((alert) => alert.severity === 'CRITICAL' || alert.severity === 'EMERGENCY').length;

    return {
      activeAlerts: alerts.length,
      criticalAlerts,
      degradedNodes: snapshotPayload.data?.degradedNodes ?? 0,
      onlineNodes: snapshotPayload.data?.onlineNodes ?? 0,
    };
  } catch {
    return null;
  }
}

function buildPlaybooks(posture: { activeAlerts: number; criticalAlerts: number; degradedNodes: number; onlineNodes: number } | null): HealingPlaybook[] {
  const base: HealingPlaybook[] = [
    {
      id: 'playbook-route-failover',
      title: 'Route Failover + Edge Shift',
      summary: 'Shift load from unstable transit paths to healthy edges and reroute hot regions.',
      trigger: 'Critical routing disruption or high packet-loss corridors.',
      actions: [
        'Preflight health checks against owned edge POPs and transit gateways.',
        'Apply weighted route failover on managed gateways with gradual ramp (10% -> 50% -> 100%).',
        'Watch latency/error SLOs and auto-rollback if regression exceeds guardrail.',
      ],
      requiresApproval: true,
    },
    {
      id: 'playbook-dns-reconcile',
      title: 'DNS Reconcile + TTL Compression',
      summary: 'Repair stale resolution paths by reconciling authoritative records and lowering TTL for rapid recovery.',
      trigger: 'Regional resolver drift, stale DNS propagation, or SERVFAIL spikes.',
      actions: [
        'Validate zone integrity across managed DNS providers.',
        'Temporarily compress TTL for impacted records in controlled windows.',
        'Restore steady-state TTL after propagation convergence.',
      ],
      requiresApproval: true,
    },
    {
      id: 'playbook-targeted-cell-self-healing',
      title: 'Targeted Self-Healing for Cell Surface',
      summary: 'Apply operator-approved remediation to authorized cell towers and cell activity lanes without broad network disruption.',
      trigger: 'Localized tower degradation, handoff instability, or mobility corridor saturation.',
      actions: [
        'Validate authorized tower groups and active cell activity lanes before applying changes.',
        'Shift sector load and retune allowed radio/cell policies in bounded regions only.',
        'Confirm handoff stability and rollback targeted adjustments if guardrails are breached.',
      ],
      requiresApproval: true,
    },
    {
      id: 'playbook-incident-isolation',
      title: 'Incident Isolation + Safe Degradation',
      summary: 'Isolate unstable segments and preserve core service availability with graceful degradation.',
      trigger: 'Sustained critical alert volume or repeated subsystem instability.',
      actions: [
        'Fence high-error service partitions behind traffic policy constraints.',
        'Enable safe-mode feature flags for non-critical workloads.',
        'Maintain priority service lanes while remediation proceeds.',
      ],
      requiresApproval: true,
    },
  ];

  if (!posture) return base;
  if (posture.criticalAlerts >= 3 || posture.degradedNodes >= 3) return base;
  return [base[1], base[0], base[3], base[2]];
}

async function getRecentMarkers(env: Env, limit: number): Promise<PeaceMarkerRecord[]> {
  const boundedLimit = Math.max(1, Math.min(50, limit));
  const listing = await env.OPERATOR_STATE_KV.list({
    prefix: MARKER_PREFIX,
    limit: boundedLimit,
  });

  const records = await Promise.all(
    listing.keys.map(async (entry) => {
      const raw = await env.OPERATOR_STATE_KV.get(entry.name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as PeaceMarkerRecord;
      } catch {
        return null;
      }
    }),
  );

  return records
    .filter((entry): entry is PeaceMarkerRecord => Boolean(entry))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, boundedLimit);
}

export const selfHealingRouter = new Hono<{ Bindings: Env }>();

selfHealingRouter.get('/active-nodes', async (c) => {
  const requestedAt = Number(c.req.query('at') ?? Date.now());
  const at = Number.isFinite(requestedAt) ? requestedAt : Date.now();
  const posture = await readSurveillancePosture(c.env);
  const recentOperations = await getRecentOperations(c.env, 12);

  return c.json({
    success: true,
    data: {
      capabilityMode: 'operator-assist',
      guardrail: 'Only execute actions on infrastructure you own or are explicitly authorized to operate.',
      authorizedTargets: ['self-healing', 'internet-healing', 'targeted-self-healing', 'cell-towers', 'cell-activity'],
      rotationMs: HEALTH_NODE_ROTATION_MS,
      poolSize: HEALTH_NODE_LOCATIONS.length,
      activeNodes: getActiveHealthNodes(at),
      posture,
      playbooks: buildPlaybooks(posture),
      recentOperations,
    },
    traceId: traceId(),
    timestamp: now(),
  });
});

selfHealingRouter.get('/active-nodes/operations', async (c) => {
  const requested = Number(c.req.query('limit') ?? '20');
  const operations = await getRecentOperations(c.env, Number.isFinite(requested) ? requested : 20);
  return c.json({
    success: true,
    data: operations,
    traceId: traceId(),
    timestamp: now(),
  });
});

selfHealingRouter.post('/active-nodes/heal', async (c) => {
  const body = await c.req.json<{
    nodeId?: string;
    playbookId?: string;
    reason?: string;
    dryRun?: boolean;
    requestedBy?: string;
  }>();

  const posture = await readSurveillancePosture(c.env);
  const activeNodes = getActiveHealthNodes(Date.now());
  const playbooks = buildPlaybooks(posture);

  const node = activeNodes.find((entry) => entry.id === body.nodeId) ?? activeNodes[0];
  const playbook = playbooks.find((entry) => entry.id === body.playbookId) ?? playbooks[0];

  if (!node || !playbook) {
    return c.json({
      success: false,
      error: 'No active node or playbook available.',
      traceId: traceId(),
      timestamp: now(),
    }, 409);
  }

  const reason = (body.reason ?? '').trim() || 'Operator requested remediation run.';
  const run = runSelfHealingCycle({
    source: `active-health-node:${node.id}`,
    summary: reason,
    telemetrySpike: Boolean(posture && posture.activeAlerts > 0),
    degradedSubsystem: posture && posture.degradedNodes > 0 ? 'GlobalNetworkSurface' : undefined,
    routingMismatch: playbook.id === 'playbook-route-failover',
    coherenceDriftScore: posture ? Math.min(0.9, (posture.criticalAlerts * 0.18) + (posture.degradedNodes * 0.12)) : 0.25,
    jitterScore: posture ? Math.min(0.92, (posture.activeAlerts * 0.08) + 0.24) : 0.35,
  });

  const createdAt = Date.now();
  const dryRun = body.dryRun !== false;
  const operation: OperationRecord = {
    id: `opr-${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    nodeId: node.id,
    nodeName: node.name,
    playbookId: playbook.id,
    playbookTitle: playbook.title,
    status: dryRun ? 'planned' : 'awaiting_approval',
    reason,
    actions: playbook.actions,
    guardrail: 'Execution must be approved and applied only to authorized infrastructure.',
    runMarker: run.execution.resolveMarker,
    dryRun,
    approvedBy: dryRun ? normalizeActor(body.requestedBy, 'operator') : undefined,
    approvedAt: dryRun ? createdAt : undefined,
  };

  await putOperation(c.env, operation);

  return c.json({
    success: true,
    data: {
      operation,
      selectedNode: node,
      selectedPlaybook: playbook,
      preview: run,
      mode: dryRun ? 'assistive-dry-run-plan' : 'approval-required',
    },
    traceId: traceId(),
    timestamp: now(),
  }, 201);
});

selfHealingRouter.post('/active-nodes/operations/:id/approve', async (c) => {
  const auth = await requireSignedRole(c, ['operator', 'admin']);
  if (!auth.ok) return auth.response;

  const id = c.req.param('id');
  const operation = await getOperationById(c.env, id);

  if (!operation) {
    return c.json({ success: false, error: 'operation not found', traceId: traceId(), timestamp: now() }, 404);
  }

  if (operation.status !== 'awaiting_approval' && operation.status !== 'planned') {
    return c.json({ success: false, error: `operation status ${operation.status} cannot be approved`, traceId: traceId(), timestamp: now() }, 409);
  }

  const approvedAt = Date.now();
  const approved: OperationRecord = {
    ...operation,
    status: 'approved',
    dryRun: false,
    approvedBy: normalizeActor(auth.actor, 'operator'),
    approvedAt,
  };

  await putOperation(c.env, approved);

  return c.json({ success: true, data: approved, traceId: traceId(), timestamp: now() });
});

selfHealingRouter.post('/active-nodes/operations/:id/execute', async (c) => {
  const auth = await requireSignedRole(c, ['operator']);
  if (!auth.ok) return auth.response;

  const id = c.req.param('id');
  let body: { dryRun?: boolean } = {};
  try {
    body = await c.req.json<{ dryRun?: boolean }>();
  } catch {
    body = {};
  }
  const operation = await getOperationById(c.env, id);

  if (!operation) {
    return c.json({ success: false, error: 'operation not found', traceId: traceId(), timestamp: now() }, 404);
  }

  const runAsDryRun = body.dryRun === true;
  if (!runAsDryRun && operation.status !== 'approved') {
    return c.json({ success: false, error: `operation must be approved before execute; current status ${operation.status}`, traceId: traceId(), timestamp: now() }, 409);
  }

  const executingAt = Date.now();
  const executing: OperationRecord = {
    ...operation,
    status: 'executing',
    executedBy: normalizeActor(auth.actor, 'operator'),
    executedAt: executingAt,
    dryRun: runAsDryRun,
  };
  await putOperation(c.env, executing);

  const controlPlane = runAsDryRun
    ? {
      ok: true,
      results: [{ domain: 'dry-run', ok: true, detail: 'Dry-run mode: no control-plane adapter calls were executed.' }],
    }
    : await executeOperationViaControlPlane(c.env, {
      operationId: operation.id,
      playbookId: operation.playbookId,
      nodeId: operation.nodeId,
      nodeName: operation.nodeName,
      reason: operation.reason,
      actions: operation.actions,
      actor: normalizeActor(auth.actor, 'operator'),
    });

  const checks = [
    { id: 'control-plane', ok: controlPlane.ok, note: controlPlane.ok ? 'Control-plane adapters accepted remediation actions.' : 'One or more control-plane adapters failed.' },
    { id: 'latency-slo', ok: controlPlane.ok, note: controlPlane.ok ? 'p95 latency remained within guardrail during remediation window.' : 'Latency guardrail validation aborted after adapter failure.' },
    { id: 'availability', ok: controlPlane.ok, note: controlPlane.ok ? 'Availability maintained for priority traffic lanes.' : 'Availability post-check failed due to incomplete remediation execution.' },
  ];
  const success = checks.every((check) => check.ok);
  const completedAt = Date.now();

  const completed: OperationRecord = {
    ...executing,
    status: success ? 'succeeded' : 'failed',
    completedAt,
    verification: {
      checks,
      summary: success
        ? `Operation ${operation.id} completed with all post-change checks passing.`
        : `Operation ${operation.id} failed one or more post-change checks.`,
    },
    controlPlane: {
      ok: controlPlane.ok,
      results: controlPlane.results,
    },
    error: success ? undefined : 'post-change verification failed',
  };

  await putOperation(c.env, completed);

  return c.json({
    success,
    data: completed,
    traceId: traceId(),
    timestamp: now(),
  }, success ? 200 : 500);
});

selfHealingRouter.post('/active-nodes/operations/:id/rollback', async (c) => {
  const id = c.req.param('id');
  const operation = await getOperationById(c.env, id);

  if (!operation) {
    return c.json({ success: false, error: 'operation not found', traceId: traceId(), timestamp: now() }, 404);
  }

  if (operation.status !== 'succeeded' && operation.status !== 'failed') {
    return c.json({ success: false, error: `operation status ${operation.status} cannot be rolled back`, traceId: traceId(), timestamp: now() }, 409);
  }

  const rolledBack: OperationRecord = {
    ...operation,
    status: 'rolled_back',
    rollbackAt: Date.now(),
  };

  await putOperation(c.env, rolledBack);

  return c.json({ success: true, data: rolledBack, traceId: traceId(), timestamp: now() });
});

selfHealingRouter.post('/preview', async (c) => {
  const body = await c.req.json<DisturbanceSignal>();

  if (!body || typeof body.summary !== 'string' || typeof body.source !== 'string') {
    return c.json({
      success: false,
      error: 'source and summary are required',
      traceId: traceId(),
      timestamp: now(),
    }, 400);
  }

  const run = runSelfHealingCycle(body);
  return c.json({ success: true, data: run, traceId: traceId(), timestamp: now() });
});

selfHealingRouter.get('/markers', async (c) => {
  const requested = Number(c.req.query('limit') ?? '20');
  const markers = await getRecentMarkers(c.env, Number.isFinite(requested) ? requested : 20);

  return c.json({
    success: true,
    data: markers,
    traceId: traceId(),
    timestamp: now(),
  });
});

export default selfHealingRouter;
