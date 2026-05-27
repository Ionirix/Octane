# Weather Intelligence Module — Vertical Slice Plan (v1)

Issued: 2026-05-27
Owner: Dashboard + API platform
Status: Ready for implementation

## 1) Outcome

Deliver a production-ready Weather Intelligence module inside the existing Octane dashboard with:

- Live radar timeline map
- Storm cell overlays with direction/speed/intensity
- Layer toggles for precipitation, wind, pressure, smoke
- Time scrubbing for recent history (default 2 hours)
- Mobile + desktop responsive behavior

This plan is designed to fit current project conventions used by Surveillance and the Hono API routes.

## 2) Vertical Slice Definition

The first integrated slice is complete when an operator can:

1. Open a new Weather screen route
2. See radar tiles for current frame
3. Scrub backwards in time for available frames
4. Toggle storm and environmental overlays
5. Click a storm cell and inspect metadata

## 3) Repository Fit (Existing Patterns)

Use these existing architectural anchors:

- Screen routing and lazy loading in src/router/index.tsx
- Screen pattern from src/screens/Surveillance.tsx
- API route registration in src/api/routes.ts
- Feature-specific handler style in src/api/handlers/surveillance.ts
- Shared UI primitives in src/components/primitives

## 4) Target File Plan

### Frontend

- Add screen: src/screens/WeatherIntelligence.tsx
- Export screen: src/screens/index.ts
- Add route: src/router/index.tsx (path suggestion: /weather)
- Add weather map wrapper: src/components/weather/WeatherMapContainer.tsx
- Add radar layer component: src/components/weather/RadarLayer.tsx
- Add storm layer component: src/components/weather/StormLayer.tsx
- Add environmental layer component: src/components/weather/EnvLayer.tsx
- Add controls: src/components/weather/LayerControlPanel.tsx
- Add timeline UI: src/components/weather/TimeScrubber.tsx
- Add details panel: src/components/weather/InfoPanel.tsx
- Add styling: src/styles/weather.css

### State and data hooks

- Add weather store: src/state/weather.ts
- Export store in src/state/index.ts
- Add hooks:
  - src/hooks/useWeatherFrames.ts
  - src/hooks/useStormCells.ts
  - src/hooks/useWeatherLayers.ts

### Data service + types

- Add service abstraction: src/modules/weather/WeatherDataService.ts
- Add caching helpers: src/modules/weather/cache.ts
- Add weather types: src/modules/weather/types.ts

### API layer (Hono)

- Add handler: src/api/handlers/weather.ts
- Register router in src/api/routes.ts via app.route('/v6/weather', weatherRouter)

### Tests

- Add service tests: tests/weather-data-service.test.ts
- Add route tests: tests/weather-routes.test.ts
- Add state tests: tests/weather-store.test.ts

## 5) API Contract (Internal)

Base path: /api/v6/weather

### GET /radar/frames

Query:

- from: ISO timestamp
- to: ISO timestamp
- stepMinutes: 5 or 10
- bbox: minLon,minLat,maxLon,maxLat

Response:

- frames: [{ timestamp, tileUrlTemplate, attribution, stale }]

### GET /storms

Query:

- time: ISO timestamp
- bbox: minLon,minLat,maxLon,maxLat

Response:

- cells: [{
  id,
  polygon,
  centroid,
  movement: { speedKts, directionDeg },
  intensity: { category, dbz },
  updatedAt,
  stale
}]

### GET /layers

Query:

- type: precipitation | wind | pressure | smoke
- time: ISO timestamp
- bbox: minLon,minLat,maxLon,maxLat

Response:

- layer: {
  type,
  renderMode: tile | vector,
  tileUrlTemplate?,
  vectorFeatures?,
  units,
  legend,
  updatedAt,
  stale
}

## 6) Frontend State Shape

Create a weather store with this minimum schema:

- selectedTime: string (ISO)
- availableTimes: string[]
- activeLayers:
  - radar: boolean
  - storms: boolean
  - precipitation: boolean
  - wind: boolean
  - pressure: boolean
  - smoke: boolean
- layerOpacity:
  - radar: number
  - precipitation: number
  - wind: number
  - pressure: number
  - smoke: number
- mapView:
  - center: [number, number]
  - zoom: number
- playback:
  - isPlaying: boolean
  - speedMs: number
- selection:
  - selectedStormId?: string
- status:
  - loadingByLayer
  - staleByLayer
  - errorByLayer

## 7) Caching + refresh behavior

- Cache key format: type + time + bbox + zoom
- Radar frame refresh: every 5-10 minutes
- Storm refresh: every 5-10 minutes
- Environmental refresh: every 10-30 minutes
- Scrubber behavior:
  - Debounce timeline changes by 120-180ms
  - Reuse cached frame immediately
  - Background fetch if cache miss
- Fallback:
  - If newest frame unavailable, show last known frame with stale badge

## 8) Delivery Phases

## Phase 1 — Radar baseline (vertical slice foundation)

Build:

- Weather screen + route
- WeatherMapContainer + Base map + RadarLayer
- TimeScrubber (last 2 hours, 5-minute increments)
- WeatherDataService radar method + /v6/weather/radar/frames endpoint

Acceptance:

- Operator can scrub radar timeline and map updates consistently
- No blocking UI during frame loading
- Mobile layout usable at <= 390px width

## Phase 2 — Storm tracking

Build:

- StormLayer with polygon + centroid + direction arrow
- Click selection and InfoPanel details
- /v6/weather/storms endpoint + schema normalization

Acceptance:

- Selecting storm shows speed, heading, intensity, updated time
- Direction vectors and polygon visibility remain readable over radar

## Phase 3 — Environmental overlays

Build:

- EnvLayer for precipitation/wind/pressure/smoke
- LayerControlPanel toggles + per-layer opacity + legends
- /v6/weather/layers endpoint

Acceptance:

- Independent toggles work without remounting whole map
- Legends and units are shown and correct for each layer

## Phase 4 — Reliability + polish

Build:

- Stale indicators per layer
- Last-known-good fallback
- Loading placeholders and no-data overlay
- Playback smoothing and small animation refinements

Acceptance:

- Data delay/failure states are explicit and non-blocking
- Scrubbing remains responsive over unstable network

## 9) Risks and mitigations

- Provider format drift:
  - Mitigation: strict adapter layer in WeatherDataService
- Tile over-fetch during scrubbing:
  - Mitigation: debounce + LRU frame cache + prefetch neighboring frames
- Mobile GPU pressure with multiple overlays:
  - Mitigation: opacity defaults, toggle limits, lower animation frequency on small screens
- Inconsistent time alignment between radar/storm/layers:
  - Mitigation: shared timeline resolver that snaps to nearest supported timestamp

## 10) Test strategy

- Unit:
  - Time snapping and frame resolution
  - Layer toggle and opacity reducers/actions
  - Cache hit/miss and stale fallback logic
- Integration:
  - /v6/weather endpoints return normalized schema
  - WeatherDataService handles missing/partial provider data
- UI:
  - Scrubber updates selected time and layer rendering
  - Storm click opens details panel
  - Layer controls affect visibility and opacity

## 11) Definition of done (v1)

Functional:

- Live radar visible with last 1-3 hour scrubbing
- Active storm cells rendered with movement/intensity metadata
- Precipitation, wind, pressure, smoke overlays independently toggleable

UX:

- Responsive map + controls on desktop and mobile
- Clear legends/units and visible stale/no-data states

Technical:

- Provider-specific mapping isolated to WeatherDataService + API adapters
- Basic cache and retry/fallback implemented
- No hard-coded provider logic inside UI components

## 12) First sprint execution checklist

1. Create weather route and WeatherIntelligence screen shell
2. Implement weather store with selectedTime, layers, mapView
3. Add WeatherDataService with mocked radar frame provider
4. Implement TimeScrubber and connect selectedTime updates
5. Add radar frame endpoint and wire real fetch path
6. Add baseline tests for store + service
