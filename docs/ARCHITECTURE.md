# Octane v6 Architecture

Octane v6 introduces the SENTINEL surveillance subsystem as a durable, edge-native monitoring layer.

## Runtime Shape

- The main worker exposes the existing Octane API surface and now exports `SurveillanceDO`.
- Surveillance endpoints are mounted under `/api/v6/surveillance` through the existing Hono router.
- The durable object keeps the planetary node snapshot and alert state in memory for local and edge execution.

## New Endpoints

- `GET /api/v6/surveillance/snapshot`
- `GET /api/v6/surveillance/nodes`
- `GET /api/v6/surveillance/alerts`
- `POST /api/v6/surveillance/alerts`

## Notes

- The surveillance system models 14 global server regions.
- The default snapshot starts with one degraded node at `ap-aus-1`.

## Self-Healing VS Protocol

Octane v6 now includes a restorative self-healing pipeline for hotfixing and stability restoration.

- `SC (Situation Capture)` classifies disturbance type and harm level and records a narrative snapshot.
- `RP (Resolution Plot)` creates a root-story explanation, a 3-beat healing arc, and chooses modality.
- `SP (Stability Protocol)` executes low-force correction in gentle mode with compassion checks and micro-reconciliation loops.
- `PR (Peaceful Resolve)` validates harmony, closure, operator alignment, and applies a peace lock marker.

Implementation:

- `src/modules/self-healing/protocol.ts`
- `src/modules/self-healing/index.ts`