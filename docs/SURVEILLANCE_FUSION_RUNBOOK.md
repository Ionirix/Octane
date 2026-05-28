# Surveillance Fusion Runbook

## Purpose
Operate the v6 surveillance map as the live visualization surface for v7 global intelligence telemetry.

## Data Path
- Primary bundle endpoint: `/api/v7/intel/global` on `https://8b39333f.octane-v7.pages.dev`
- Domain fallback fan-in endpoints:
  - `/api/v7/intel/global/nodes`
  - `/api/v7/intel/global/subsystems`
  - `/api/v7/intel/global/flows`
  - `/api/v7/intel/global/events`
  - `/api/v7/intel/global/metrics`
  - `/api/v7/intel/global/geo`

## Runtime Behavior
- Polling transport is active by default.
- Default refresh interval: 8 seconds.
- Timeout per fetch attempt: 6.5 seconds.
- Retry policy: exponential backoff (3 retries).
- Last known good payload is cached in browser local storage for warm restart.

## Operator Controls
- Layer toggles: nodes, subsystems, flows, events, geo.
- Focus modes:
  - health: nodes + subsystems + geo
  - flow: nodes + flows + geo
  - event: nodes + events + geo
- Refresh interval selector: 4s, 8s, 15s.
- Manual refresh button for immediate fetch.

## Status Strip Semantics
- connected: live telemetry updates are flowing.
- reconnecting: polling is retrying after transport errors.
- degraded: retries are elevated and transport quality is reduced.
- stale: last success exceeded stale threshold.

## Stale and Fallback Rules
- Stale threshold: 24 seconds without successful telemetry update.
- On startup, cached payload is loaded if available.
- If transport is unavailable, UI remains interactive and shows connection degradation.

## Data Safety
- Coordinates are intentionally coarsened during normalization.
- Region abstraction is honored by reducing coordinate precision before rendering.
- Auth header support is available in client options for signed-request hardening.

## Troubleshooting
1. If status remains reconnecting, verify endpoint reachability and CORS policy.
2. If status is stale, use manual refresh to force fetch and validate response freshness.
3. If map shows no events, verify events layer toggle and inspect global/domain endpoint payloads.
4. If only fallback data appears after reload, clear cache key `octane-v7-surveillance-last-good` and retry.

## Stream Upgrade Boundary
- Transport adapter contract is start/stop with message and error callbacks.
- Polling transport is the current default implementation.
- Websocket adapter can be added later without changing rendering code.
