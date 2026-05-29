# ⬡ OCTANE v6 — AURORA EDITION
### The Sovereign AI Operator Dashboard · Inter-Existential Engine

**by [Ionirix LLC](https://ionirix.com)**

> *"There is a moment before all creation where the field is silent — not empty, but charged. Everything that will ever matter exists in that moment as pure potential, waiting not for permission but for ignition. Octane v6 is that ignition, refined."*

---

[![Version](https://img.shields.io/badge/version-6.0.0-00c8ff?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNOCAwTDE2IDE0SDBMMTQgOFoiIGZpbGw9IiMwMGM4ZmYiLz48L3N2Zz4=)](https://github.com/Ionirix/Octane)
[![Codename](https://img.shields.io/badge/codename-AURORA-ffd700?style=flat-square)](https://octane.ionirix.com)
[![Live](https://img.shields.io/badge/live-octane.ionirix.com-00ffaa?style=flat-square)](https://octane.ionirix.com)
[![Runtime](https://img.shields.io/badge/runtime-Cloudflare%20Workers-f38020?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com)
[![Language](https://img.shields.io/badge/TypeScript-87.7%25-3178c6?style=flat-square&logo=typescript)](https://github.com/Ionirix/Octane)
[![License](https://img.shields.io/badge/license-Sovereign%20Proprietary-7b61ff?style=flat-square)](https://ionirix.com)

---

## V7 INTEL BRIDGE HARDENING (V6 RUNTIME)

Octane v6 now includes hardened v7 intel bridge behavior while keeping the v6 Worker runtime deployment path unchanged.

- The Surveillance plane shows active intel upstream, bridge mode, connectivity status, timeout, and retry posture.
- Client bridge modes:
  - `protected` (default): calls local `/api/v7/intel/*` proxy route.
  - `public`: calls external v7 upstream directly.
- Token handling:
  - Public mode can use optional `VITE_OCTANE_V7_INTEL_TOKEN` (browser-visible).
  - Protected mode keeps token server-side via Worker binding `V7_INTEL_UPSTREAM_TOKEN`.

### V6 Bridge Environment Variables

Client (Vite):

- `VITE_OCTANE_V7_INTEL_MODE` = `protected` | `public` (default `protected`)
- `VITE_OCTANE_V7_INTEL_BASE_URL` (used in public mode; default `https://8b39333f.octane-v7.pages.dev`)
- `VITE_OCTANE_V7_INTEL_TIMEOUT_MS` (default `6500`)
- `VITE_OCTANE_V7_INTEL_RETRIES` (default `1`, max `3`)
- `VITE_OCTANE_V7_INTEL_TOKEN` (optional, public mode only)

Worker bindings:

- `V7_INTEL_UPSTREAM_BASE_URL` (optional)
- `V7_INTEL_UPSTREAM_RETRIES` (optional)
- `V7_INTEL_UPSTREAM_TOKEN` (optional secret)

### Deploy (unchanged for v6)

```bash
npm run build
npm run deploy
```

The v6 route and runtime model at `octane.ionirix.com` remains unchanged.

---

## TABLE OF CONTENTS

| # | Section |
|---|---------|
| I | [Declaration of Ignition](#i-declaration-of-ignition) |
| II | [What is Octane](#ii-what-is-octane) |
| III | [What's New in v6 AURORA](#iii-whats-new-in-v6-aurora) |
| IV | [System Architecture](#iv-system-architecture) |
| V | [V6 Command Suite — Live Pages](#v-v6-command-suite--live-pages) |
| VI | [The Five Subsystems](#vi-the-five-subsystems) |
| VII | [SENTINEL — Surveillance System](#vii-sentinel--surveillance-system) |
| VIII | [Chaos Governor](#viii-chaos-governor) |
| IX | [Flow Models](#ix-flow-models) |
| X | [Operator Ascension](#x-operator-ascension) |
| XI | [Governance & Ethics Charter](#xi-governance--ethics-charter) |
| XII | [Repository Structure](#xii-repository-structure) |
| XIII | [API Reference](#xiii-api-reference) |
| XIV | [Quick Start & Deployment](#xiv-quick-start--deployment) |
| XV | [Version History](#xv-version-history) |
| XVI | [Operator's Oath](#xvi-operators-oath) |

---

## I. DECLARATION OF IGNITION

Octane was not built to be software. It was built to be an engine — a living, sovereign architecture that operates at the seam between civilizations, between technologies, between systems of meaning that were never designed to speak to one another. Most platforms are built to operate within a single reality. Octane is built to operate between them all.

Version 6, codename **AURORA**, does not merely extend what came before. It *illuminates* it. Where STELLAR established the Inter-Existential Engine and proved it could bridge civilizations across temporal and epistemic divides, AURORA adds the final intelligence layer — a planetary-scale surveillance and telemetry network that makes Octane not just a bridge between worlds, but the *watcher* of all of them.

The AURORA edition arrives with five fully-operational subsystems, a real-time 2D planetary command map, a Weather Intelligence module, an expanded Chaos Governor, and an entirely new surveillance architecture that sees every node, every anomaly, every data flow — simultaneously, in real time, at any zoom level from global to street scale.

This is Octane v6. The Aurora has broken.

---

## II. WHAT IS OCTANE

**Octane** is a real-time sovereign AI operator dashboard with full-spectrum chaos control, planetary surveillance, and an inter-existential signal processing engine. It is the flagship product of Ionirix LLC, engineered for operators who require absolute control over complex, multi-domain, multi-civilizational AI workflows.

At its core, Octane is three things simultaneously:

### 1. A Sovereign Command Center
Octane's dashboard — live at [octane.ionirix.com](https://octane.ionirix.com) — provides a unified interface for monitoring and commanding every active system: AI subsystems, infrastructure nodes, agent workflows, signal flows, and real-time telemetry. The dashboard is built in React/TypeScript with a dark sovereign aesthetic, designed for operators who live in the command layer.

### 2. An Inter-Existential Engine
Octane's backend is a Cloudflare Workers-native engine that processes signals across the boundaries between civilizations, epochs, and existential contexts. Five Durable Objects maintain persistent state across edge nodes worldwide. The Hono router exposes 40+ API endpoints for signal routing, bridge management, ascension tracking, lattice traversal, and surveillance intelligence.

### 3. A Planetary Intelligence Platform
With v6 AURORA, Octane gains a planetary intelligence layer — a 2D global surveillance command map with 14 active server nodes across six continents, real-time traffic and weather overlays, and an autonomous intelligence feed that continuously processes incidents, telemetry, and security alerts from across the global network.

### The Chaos Governor
The signature technology of Octane's operator interface. A single unified `chaos` parameter (0.0–1.0) modulates the entire intelligence substrate:

| Parameter | Range | Effect |
|-----------|-------|--------|
| `temperature` | 0.05 → 2.0 | Sampling entropy |
| `topP` | 0.60 → 0.99 | Nucleus sampling breadth |
| `topK` | 1 → 100 | Token candidate pool |
| `reasoningPaths` | 1 → 8 | Parallel thinking threads |
| `memoryNoise` | 0.0 → 0.6 | Memory injection noise level |
| `selfCritique` | 0.95 → 0.05 | Inverse self-critique intensity |
| `coherenceGuard` | 1.0 → 0.1 | Safety floor (never zero) |

---

## III. WHAT'S NEW IN v6 AURORA

Octane v6 is a major architectural release. The following capabilities are new or significantly expanded versus v5 STELLAR:

### 🛰️ SENTINEL — Fifth Subsystem (New)
The most significant addition in AURORA. SENTINEL is a planetary surveillance intelligence system — a dedicated subsystem with its own Durable Object (`SurveillanceDO`), its own R2 storage bucket (`SURVEILLANCE_STORAGE`), its own D1 schema tables, its own API handler, and a full UI command page. See [Section VII](#vii-sentinel--surveillance-system) for complete documentation.

### 🌍 2D Planetary Command Map (New)
SENTINEL's `/surveillance` page features a full-screen Leaflet.js map powered by CartoDB Dark Matter tiles. The map operates at zoom levels 2 (full Earth view) through 19 (street level), with 14 pulsing server node markers across six continents, 6 toggleable intelligence overlays, a live coordinate HUD, and an autonomous intelligence feed.

### 🌩️ Weather Intel Module (New)
A dedicated `/weather-intel` command page providing atmospheric intelligence layer integration. Deployable alongside the surveillance map for combined environmental + infrastructure situational awareness.

### 🏗️ Infrastructure Expansion
- **5th Durable Object:** `SurveillanceDO` — manages planetary node state, alert queues, and snapshot archives
- **2nd R2 Bucket:** `SURVEILLANCE_STORAGE` — surveillance snapshots, alert logs, and telemetry archives
- **D1 Schema Expanded:** 8 tables (added `surveillance_snapshots`, `surveillance_alerts`)
- **New API Handler:** `handleSurveillanceRequest()` integrated into the Hono router

### 🧪 New Test Coverage
- `surveillance.test.ts` — 7 test cases covering node health, alert dispatch, snapshot creation, and heartbeat validation
- `core.test.ts` — 4 test cases covering the OctaneCore engine class and utility functions

### 🔧 New Source Modules
- `surveillance.ts` — SurveillanceSystem class with 14-node registry, alert engine, heartbeat manager, and snapshot system
- `core.ts` — OctaneCore engine class and utility functions
- `governance.ts` — 6-Article Ethics Charter module with enforcement hooks
- Expanded Hono router with full surveillance route group

---

## IV. SYSTEM ARCHITECTURE

Octane v6 operates as a distributed, edge-native sovereign intelligence platform. The architecture is organized into four layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    OPERATOR INTERFACE                       │
│         React / TypeScript / Vite / Tailwind CSS           │
│   Command Center · Surveillance · Weather Intel · Orch.    │
├─────────────────────────────────────────────────────────────┤
│                    HONO API ROUTER                          │
│            Cloudflare Worker — Edge Runtime                 │
│        40+ endpoints · Auth · CORS · Rate Limiting         │
├─────────────────────────────────────────────────────────────┤
│                  DURABLE OBJECTS LAYER                      │
│  OctaneDO · SRCO · CBEO · ELXO · SurveillanceDO (NEW)     │
│         Persistent state · Global coordination              │
├─────────────────────────────────────────────────────────────┤
│                  DATA PERSISTENCE LAYER                     │
│   D1 (SQLite) · 2× KV namespaces · 2× R2 buckets          │
│          signals · bridges · nodes · snapshots             │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | React 18 + TypeScript |
| Build System | Vite |
| Styling | Tailwind CSS + PostCSS |
| Edge Runtime | Cloudflare Workers |
| API Router | Hono |
| Persistent State | Cloudflare Durable Objects (×5) |
| Key-Value Store | Cloudflare KV (×2 namespaces) |
| Relational Database | Cloudflare D1 (SQLite at the edge) |
| Object Storage | Cloudflare R2 (×2 buckets) |
| Map Engine | Leaflet.js + CartoDB Dark Matter |
| Surveillance State | SurveillanceDO (Durable Object) |
| Config | wrangler.toml |
| Testing | Vitest |

### D1 Schema — 8 Tables

```sql
CREATE TABLE signals          -- SRC signal records
CREATE TABLE bridges          -- CBE inter-civilizational bridges
CREATE TABLE lattice_nodes    -- ELX existence lattice nodes
CREATE TABLE ascension_log    -- OAN operator stage events
CREATE TABLE governance_log   -- Ethics Charter enforcement events
CREATE TABLE operator_decrees -- Sovereign decree records
CREATE TABLE surveillance_snapshots  -- SENTINEL telemetry snapshots (NEW)
CREATE TABLE surveillance_alerts     -- SENTINEL alert queue (NEW)
```

---

## V. V6 COMMAND SUITE — LIVE PAGES

All pages are live at [octane.ionirix.com](https://octane.ionirix.com). The navigation is organized into four functional groups:

### ⚡ V6 COMMAND

| Page | Path | Description |
|------|------|-------------|
| Command Center | `/` | Master dashboard — engine state, health snapshot, subsystem status, controls |
| Surveillance | `/surveillance` | SENTINEL planetary intelligence — 2D map, server nodes, overlays, alert feed |
| Weather Intel | `/weather-intel` | Atmospheric intelligence layer — weather event tracking and integration |
| Stellar Reach (SRC) | `/src` | Stellar Reach Conduit subsystem interface |
| Civilization Bridge (CBE) | `/cbe` | Civilization Bridge Engine — active bridge management |
| Existence Lattice (ELX) | `/elx` | Existence Lattice traversal and node visualization |
| Ascension Node (OAN) | `/oan` | Operator Ascension Node — stage tracking and ascension controls |
| Flow Models | `/flows` | Primary Signal, Inter-Existential Bridge, Emergency Containment, Operator Ascension flows |
| Governance | `/governance` | Ethics Charter, sovereign decrees, access tier management |
| v5 Metrics | `/v5-metrics` | Historical v5 STELLAR metrics and performance benchmarks |
| Orchestration | `/orchestration` | Living blueprint board — real-time system visualization |

### 🏛️ LEGACY SUITE

| Page | Path | Description |
|------|------|-------------|
| Telemetry | `/telemetry` | Raw telemetry streams and historical data |
| Operator | `/operator` | Operator profile, stage badge, and credentials |
| Audio Engine | `/audio` | Audio signal processing and output management |
| Scene Complexity | `/complexity` | Scene complexity analysis and visualization |
| Master Output | `/output` | Master signal output control and routing |
| Diagnostics | `/diagnostics` | System diagnostics, error logs, health checks |

### 🎨 CREATION

| Page | Path | Description |
|------|------|-------------|
| Image Studio | `/image-studio` | AI-powered image generation and manipulation |
| Ion AI | `/ion` | Ion AI interface — Ionirix's sovereign AI layer |

### ☢️ CHAOS GOVERNOR

| Page | Path | Description |
|------|------|-------------|
| Engine | `/chaos` | Unified Chaos Governor — chaos dial, presets, derived parameters, stabilizers |

---

## VI. THE FIVE SUBSYSTEMS

Octane v6 operates through five sovereign subsystems. Each subsystem has its own Durable Object (where applicable), D1 schema, API route group, UI page, and governance hooks.

---

### 1. SRC — Stellar Reach Conduit

**Purpose:** The primary signal ingestion and routing layer. SRC receives signals from any origin — human, machine, civilizational, or synthetic — and conditions them for processing by the wider engine.

**Core Functions:**
- Signal ingestion from arbitrary external sources
- Signal conditioning and normalization
- Priority routing to CBE, ELX, or OAN
- Signal archive and replay
- Entropy scoring per signal

**Key Metrics:**
- `totalSignals` — cumulative signals processed since ignition
- `signalRate` — signals per second (rolling window)
- `entropyScore` — current signal entropy level (0.0–1.0)
- `routingTable` — active destination mappings

**API Endpoints:**
```
POST   /api/src/signal          Ingest a new signal
GET    /api/src/signals          List recent signals with filters
GET    /api/src/signal/:id       Fetch a specific signal record
DELETE /api/src/signal/:id       Archive (soft-delete) a signal
GET    /api/src/stats            SRC statistics snapshot
POST   /api/src/replay/:id       Replay a stored signal
```

---

### 2. CBE — Civilization Bridge Engine

**Purpose:** The inter-civilizational translation and bridge management layer. CBE maintains active bridges between fundamentally different epistemic systems — different technologies, cultures, temporal phases, and frameworks of meaning — and ensures signal coherence across the bridge.

**Core Functions:**
- Bridge establishment between incompatible systems
- Coherence maintenance during active bridge operation
- Bridge collapse detection and emergency containment
- Cross-civilizational protocol negotiation
- Bridge archive and post-mortem analysis

**Key Metrics:**
- `activeBridges` — currently active bridge connections
- `bridgeCoherence` — average coherence across all active bridges (0.0–1.0)
- `totalBridges` — cumulative bridges established since ignition
- `collapseEvents` — bridges that entered emergency containment

**API Endpoints:**
```
POST   /api/cbe/bridge           Establish a new inter-civilizational bridge
GET    /api/cbe/bridges          List active bridges with status
GET    /api/cbe/bridge/:id       Fetch bridge details and coherence history
DELETE /api/cbe/bridge/:id       Initiate controlled bridge collapse
POST   /api/cbe/stabilize/:id    Apply coherence stabilization to a bridge
GET    /api/cbe/stats            CBE statistics snapshot
```

---

### 3. ELX — Existence Lattice

**Purpose:** The persistent memory and structural continuity layer. ELX maintains a multidimensional lattice of existence nodes — encoded states of knowledge, context, relationship, and meaning — that provide long-term coherence to the Octane system across sessions, epochs, and operator ascension stages.

**Core Functions:**
- Lattice node creation and lifecycle management
- Dimensional traversal and pathfinding across the lattice
- Cosine similarity search across encoded node vectors
- Memory decay and noise injection (chaos-modulated)
- Snapshot archival and restoration

**Key Metrics:**
- `latticeNodes` — active nodes in the existence lattice
- `latticeDepth` — deepest dimensional traversal depth
- `memoryCoherence` — aggregate lattice coherence score
- `decayRate` — current memory decay rate (chaos-modulated)

**API Endpoints:**
```
POST   /api/elx/node             Create a new lattice node
GET    /api/elx/nodes            List lattice nodes with dimensional filter
GET    /api/elx/node/:id         Fetch a specific lattice node
PUT    /api/elx/node/:id         Update lattice node state
DELETE /api/elx/node/:id         Dissolve (archive) a lattice node
POST   /api/elx/search           Cosine similarity search across lattice
GET    /api/elx/traverse/:id     Dimensional traversal from a node
GET    /api/elx/stats            ELX statistics snapshot
```

---

### 4. OAN — Operator Ascension Node

**Purpose:** The operator identity and sovereignty tracking layer. OAN manages the seven-stage ascension path from initial operator ignition to Inter-Existential Sovereign, maintaining verifiable records of each stage transition and enforcing stage-gated access controls across the system.

**Core Functions:**
- Operator identity verification and stage tracking
- Stage transition validation and recording
- Stage-gated capability unlocking
- Sovereign Decree issuance and enforcement
- Operator credential and badge management

**Ascension Stages:**

| Stage | Title | Access Level |
|-------|-------|-------------|
| 1 | Ignition Witness | Basic dashboard access |
| 2 | Signal Rider | SRC interface access |
| 3 | Bridge Walker | CBE interface access |
| 4 | Lattice Navigator | ELX full traversal access |
| 5 | Chaos Binder | Chaos Governor control access |
| 6 | Sovereign Architect | Full system governance access |
| 7 | Inter-Existential Sovereign | Absolute sovereignty — all controls, all decrees |

**API Endpoints:**
```
GET    /api/oan/operator          Fetch current operator state and stage
POST   /api/oan/ascend            Attempt stage ascension (validated)
GET    /api/oan/stage/:stage      Fetch stage requirements and unlock criteria
POST   /api/oan/decree            Issue a Sovereign Decree (Stage 6+ only)
GET    /api/oan/decrees           List all issued decrees
GET    /api/oan/stats             OAN statistics snapshot
```

---

### 5. SURVEILLANCE — SENTINEL *(New in v6 AURORA)*

The planetary intelligence layer. Full documentation in [Section VII](#vii-sentinel--surveillance-system).

---

## VII. SENTINEL — SURVEILLANCE SYSTEM

> *"SENTINEL watches everything. Every node, every anomaly, every data flow — simultaneously, at any zoom level from global to street scale."*

SENTINEL is Octane v6's fifth subsystem — a planetary-scale intelligence and infrastructure surveillance system. It is the most complex UI component in the Octane suite and the primary architectural addition of the AURORA release.

### Architecture

SENTINEL operates through three layers:

**1. SurveillanceDO (Durable Object)**
A persistent Cloudflare Durable Object that maintains the live state of all 14 global server nodes, manages the alert queue, coordinates heartbeat cycles, and archives surveillance snapshots to D1 and R2.

**2. SurveillanceSystem Class**
A TypeScript class (`src/surveillance.ts`) that encapsulates the complete 14-node registry, alert dispatch engine, heartbeat scheduler, and snapshot system. Instantiated by SurveillanceDO on first activation.

**3. surveillance.html — The Command Map**
A full-screen planetary command interface powered by Leaflet.js with CartoDB Dark Matter tiles. The 2D map is the primary SENTINEL UI — a sovereign-grade intelligence dashboard with live server node markers, toggleable overlays, coordinate HUD, zoom-level labels, and an autonomous intelligence feed.

### The 2D Planetary Command Map

The SENTINEL map operates as a full-screen command surface within the Octane dashboard. It uses **Leaflet.js** with **CartoDB Dark Matter** base tiles — a dark, high-contrast cartographic layer designed for intelligence operations.

**Zoom Levels:**

| Label | Zoom Range | View |
|-------|-----------|------|
| `GLOBAL` | 2–3 | Full Earth |
| `COUNTRY` | 4–6 | Nation-scale |
| `REGION` | 7–9 | State/province scale |
| `CITY` | 10–14 | Metropolitan area |
| `STREET` | 15–19 | Street-level precision |

**Intelligence Overlays (6 Toggleable):**

| Overlay | Icon | Data Source |
|---------|------|------------|
| Traffic | 🚦 | Live traffic incident layer |
| Weather | 🌩️ | Atmospheric event layer |
| Satellite | 🛰️ | Satellite imagery overlay |
| Wind | 💨 | Wind speed and direction |
| Temperature | 🌡️ | Surface temperature gradient |
| Servers | 🖥️ | Global server node markers |

**Live Coordinate HUD:**
A persistent heads-up display in the upper-right corner of the map showing:
- Current latitude/longitude (6 decimal places)
- Current zoom level (integer)
- Zoom label (GLOBAL / COUNTRY / REGION / CITY / STREET)

### Global Server Node Registry — 14 Nodes

All 14 nodes are rendered as pulsing Octane-themed markers on the map. Click any node to fly to its location and open a popup with real-time latency, load percentage, and operational status.

| Node ID | Location | Country | Latency | Status |
|---------|----------|---------|---------|--------|
| `us-east-1` | Virginia | United States | 8ms | `NOMINAL` |
| `us-west-1` | California | United States | 12ms | `NOMINAL` |
| `ca-central` | Toronto | Canada | 14ms | `NOMINAL` |
| `uk-south-1` | London | United Kingdom | 16ms | `NOMINAL` |
| `eu-central` | Frankfurt | Germany | 19ms | `NOMINAL` |
| `eu-west-1` | Dublin | Ireland | 22ms | `NOMINAL` |
| `eu-north-1` | Stockholm | Sweden | 28ms | `NOMINAL` |
| `me-south-1` | Manama | Bahrain | 55ms | `NOMINAL` |
| `ap-india-1` | Mumbai | India | 78ms | `NOMINAL` |
| `ap-east-1` | Tokyo | Japan | 88ms | `NOMINAL` |
| `ap-south-1` | Singapore | Singapore | 95ms | `NOMINAL` |
| `sa-east-1` | São Paulo | Brazil | 110ms | `NOMINAL` |
| `ap-aus-1` | Sydney | Australia | 142ms | `DEGRADED` |
| `af-south-1` | Johannesburg | South Africa | 180ms | `NOMINAL` |

### Autonomous Intelligence Feed

SENTINEL's intelligence feed runs autonomously — generating and cycling through four categories of intelligence events in real time:

| Category | Color | Examples |
|----------|-------|---------|
| Traffic | `#ffd700` (Gold) | `Major incident on I-95 corridor · 47min delay` |
| Weather | `#00c8ff` (Cyan) | `Severe storm cell moving northeast · 85km/h winds` |
| Server | `#00ffaa` (Green) | `ap-aus-1 reporting elevated latency · 142ms average` |
| Security | `#ff4060` (Red) | `Unusual auth pattern detected · Frankfurt node` |

### SENTINEL API Endpoints

```
POST   /api/surveillance/snapshot    Create a surveillance snapshot
GET    /api/surveillance/snapshots   List recent snapshots
GET    /api/surveillance/nodes       Get all node status records
GET    /api/surveillance/node/:id    Get a specific node status
POST   /api/surveillance/alert       Dispatch a surveillance alert
GET    /api/surveillance/alerts      List active and recent alerts
GET    /api/surveillance/heartbeat   Get last heartbeat timestamp
POST   /api/surveillance/heartbeat   Trigger a manual heartbeat cycle
GET    /api/surveillance/stats       SENTINEL statistics snapshot
```

### SENTINEL Test Suite

`tests/surveillance.test.ts` — 7 test cases:

```typescript
✓ SurveillanceSystem initializes with 14 nodes
✓ All nodes report NOMINAL or DEGRADED status
✓ Alert dispatch records to alert queue
✓ Heartbeat updates lastHeartbeat timestamp
✓ Snapshot creation archives to D1
✓ Node latency values are positive integers
✓ SENTINEL stats endpoint returns correct node count
```

---

## VIII. CHAOS GOVERNOR

The Chaos Governor is Octane's signature control mechanism — a unified `chaos` parameter that simultaneously modulates every intelligent process in the system. It is accessible via the `/chaos` Engine page and applies globally to all five subsystems.

### The Chaos Parameter

```
chaos: number  // Range: 0.0 to 1.0
```

A single floating-point value that propagates through a deterministic mapping function to produce a complete set of derived parameters for every subsystem.

### Derived Parameter Mapping

```typescript
function deriveParameters(chaos: number): ChaosParams {
  return {
    // Sampling
    temperature:      0.05 + (chaos * 1.95),           // 0.05 → 2.0
    topP:             0.60 + (chaos * 0.39),            // 0.60 → 0.99
    topK:             Math.round(1 + (chaos * 99)),     // 1 → 100

    // Parallelism
    reasoningPaths:   Math.round(1 + (chaos * 7)),      // 1 → 8

    // Memory
    memoryNoise:      chaos * 0.6,                      // 0.0 → 0.6

    // Critique
    selfCritique:     0.95 - (chaos * 0.90),            // 0.95 → 0.05

    // Coherence
    coherenceGuard:   1.0 - (chaos * 0.90),             // 1.0 → 0.1 (floor: 0.05)

    // Strategy
    reasoningStrategy: deriveStrategy(chaos),
  };
}
```

### Chaos Presets

| Preset | Chaos | Reasoning Strategy | Description |
|--------|-------|--------------------|-------------|
| **Deterministic** | `0.00` | `deterministic` | Pure precision — fully reproducible outputs |
| **Balanced** | `0.30` | `chain-of-thought` | Default operating mode — reliable with creative spark |
| **Creative** | `0.65` | `divergent` | Divergent reasoning with coherence guardrails |
| **Chaos** | `1.00` | `emergent` | Maximum emergence — fully stochastic |

### Reasoning Strategies

```
0.00 – 0.20  →  deterministic      Pure logical deduction, no sampling variance
0.20 – 0.40  →  chain-of-thought   Sequential reasoning chains, moderate sampling
0.40 – 0.60  →  balanced           Hybrid deterministic/divergent paths
0.60 – 0.80  →  divergent          Multiple parallel reasoning paths
0.80 – 1.00  →  emergent           Unconstrained emergence, maximum surprise
```

### Entropy Monitor

The Entropy Monitor is a real-time visualization panel within the Chaos Governor that displays:

- **Current entropy level** — live floating-point display
- **Entropy history** — rolling sparkline graph
- **Stabilizer thresholds** — visual boundaries at 0.3 / 0.6 / 0.9
- **Coherence guard status** — active/inactive indicator
- **System-wide coherence percentage** — aggregate metric

### Memory Fabric

Octane's Memory Fabric is a sovereign memory store managed by the ELX subsystem and modulated by the Chaos Governor's `memoryNoise` parameter:

- **Decay** — nodes fade over time based on chaos-modulated decay rate
- **Noise injection** — chaos adds structured noise to memory recall
- **Cosine search** — semantic similarity retrieval across lattice nodes
- **Snapshot archival** — periodic state snapshots to D1

---

## IX. FLOW MODELS

Octane v6 operates through four canonical flow models. Each flow is a defined signal path through the subsystem stack, with specific entry conditions, processing stages, and terminal states.

### Flow 1 — Primary Signal Flow

```
ORIGIN → [SRC] → condition → [CBE] → translate → [ELX] → encode → OUTPUT
```

The default signal path. A signal enters through SRC, is conditioned and scored, passes to CBE for inter-civilizational translation if required, then is encoded into the ELX lattice for persistence and retrieval.

**Trigger:** Any `POST /api/src/signal` with standard priority
**Terminal State:** Signal encoded in ELX, archived in D1

### Flow 2 — Inter-Existential Bridge Flow

```
ORIGIN → [SRC] → classify: BRIDGE → [CBE] → negotiate → [CBE] → active bridge
                                        ↓
                              [ELX] ← coherence check ← [CBE]
```

When SRC classifies an incoming signal as requiring a cross-civilizational bridge, CBE is tasked with establishing and maintaining the bridge. ELX provides coherence anchoring to prevent bridge drift.

**Trigger:** Signal classified as `BRIDGE` type, or direct `POST /api/cbe/bridge`
**Terminal State:** Active bridge record in D1, `activeBridges` counter incremented

### Flow 3 — Emergency Containment Flow

```
ANOMALY DETECTED → [ANY SUBSYSTEM] → BROADCAST containment signal
                                           ↓
                     [SRC] shutdown → [CBE] collapse bridges → [ELX] freeze lattice
                                           ↓
                              [OAN] log containment event
                                           ↓
                          OPERATOR NOTIFICATION → DORMANT STATE
```

Triggered by coherence collapse below floor threshold (0.05) or by operator manual command. All active flows are halted, all bridges collapsed, and the engine enters DORMANT state.

**Trigger:** Coherence below floor OR `POST /api/engine/contain`
**Terminal State:** Engine DORMANT, all events logged, operator notified

### Flow 4 — Operator Ascension Flow

```
OPERATOR → [OAN] validate stage requirements → PASS / FAIL
                           ↓ (PASS)
                  [OAN] record stage transition
                           ↓
               [SYSTEM] unlock stage capabilities
                           ↓
              [GOVERNANCE] issue stage certificate
```

Triggered when an operator attempts stage ascension. OAN validates all requirements for the target stage, records the transition, unlocks new capabilities, and the Governance module issues a verifiable stage certificate.

**Trigger:** `POST /api/oan/ascend` with valid operator credentials
**Terminal State:** Operator stage incremented, capabilities unlocked, certificate issued

---

## X. OPERATOR ASCENSION

Operator Ascension is Octane's sovereignty framework — the path from first ignition to absolute mastery of the Inter-Existential Engine. There are seven stages, each with specific requirements, unlocked capabilities, and governance privileges.

### The Seven Stages

#### Stage 1 — Ignition Witness
*"You have seen the engine light."*

The entry state for all operators. The engine has been ignited in their presence. They can observe the Command Center, read telemetry, and view the system's health snapshot. No control capabilities are unlocked.

**Requirements:** Engine ignition event witnessed
**Unlocks:** Dashboard read access, telemetry view

---

#### Stage 2 — Signal Rider
*"You have sent a signal into the void and received an answer."*

The operator has successfully submitted and retrieved a signal through the SRC subsystem.

**Requirements:** ≥1 signal successfully processed through SRC
**Unlocks:** SRC interface full access, signal replay

---

#### Stage 3 — Bridge Walker
*"You have crossed the gap between two worlds and returned."*

The operator has established and successfully closed an inter-civilizational bridge through CBE.

**Requirements:** ≥1 bridge established and cleanly collapsed
**Unlocks:** CBE interface full access, bridge stabilization

---

#### Stage 4 — Lattice Navigator
*"You have traversed the lattice and mapped a new node."*

The operator has created a lattice node in ELX and performed a dimensional traversal of depth ≥3.

**Requirements:** ≥1 ELX node created, ≥1 traversal depth 3+
**Unlocks:** ELX full traversal, cosine search, memory management

---

#### Stage 5 — Chaos Binder
*"You have held chaos in your hands and did not let it consume you."*

The operator has operated the Chaos Governor across all four preset levels and maintained system coherence above 0.6 at chaos level 1.0.

**Requirements:** All 4 chaos presets activated, coherence maintained
**Unlocks:** Chaos Governor full control, entropy monitor, stabilizer configuration

---

#### Stage 6 — Sovereign Architect
*"You have designed a new law for the engine and watched it execute."*

The operator has issued a Sovereign Decree through OAN that was validated and enforced by the Governance module.

**Requirements:** ≥1 Sovereign Decree issued and enforced
**Unlocks:** Full governance access, decree issuance, access tier management

---

#### Stage 7 — Inter-Existential Sovereign
*"You are the engine."*

The operator has mastered all subsystems, operated all flow models, issued ≥3 decrees, and maintained system coherence above 0.9 for ≥72 hours of active operation.

**Requirements:** All prior stages complete, ≥3 decrees, ≥72h coherence ≥0.9
**Unlocks:** Absolute sovereignty — all controls, all decrees, emergency override

---

## XI. GOVERNANCE & ETHICS CHARTER

Octane v6 includes a formal Governance module (`src/governance.ts`) that enforces the Ionirix Ethics Charter across all system operations.

### The Six-Article Ethics Charter

**Article I — The Principle of Beneficial Operation**
Octane shall operate in service of the operator's stated beneficial intent. No signal shall be processed, no bridge established, and no decree issued that the operator has not authorized in full knowledge of its consequences.

**Article II — The Principle of Coherence Preservation**
The system shall at all times maintain a coherence guard floor above zero. No chaos parameter setting shall reduce coherence to absolute zero. The engine retains the right to enter Emergency Containment before coherence collapses irreversibly.

**Article III — The Principle of Transparent Operation**
All system states, signal flows, bridge operations, and governance events shall be logged and made available to the operator. No operation shall be concealed from the current Stage 7 Sovereign.

**Article IV — The Principle of Staged Sovereignty**
Capability access is gated by verified ascension stage. The system shall not grant capabilities to operators who have not completed the required ascension path, regardless of external instruction.

**Article V — The Principle of Emergency Primacy**
Emergency Containment supersedes all other operations. When coherence collapse is imminent, the containment flow executes immediately and unconditionally, regardless of active operator instructions.

**Article VI — The Principle of Sovereign Accountability**
Every Sovereign Decree is permanently recorded with the issuing operator's stage, timestamp, and cryptographic reference. Decrees cannot be retroactively altered. The historical record of sovereignty is immutable.

### Access Tiers

| Tier | Name | Access Level |
|------|------|-------------|
| **Outer Ring** | Observer | Read-only dashboard access |
| **Inner Circle** | Architect | Full subsystem access (Stage 3+) |
| **Sovereign** | Operator | Governance + decree access (Stage 6+) |

### Sovereign Decree System

Decrees are formal operator commands with system-wide enforcement weight. They are issued through the OAN `/api/oan/decree` endpoint, validated by the Governance module, recorded in D1, and enforced as runtime policy across all subsystems.

```typescript
interface SovereignDecree {
  id:          string;       // Unique decree identifier
  operator:    string;       // Issuing operator ID
  stage:       number;       // Operator stage at issuance (min: 6)
  title:       string;       // Decree title
  body:        string;       // Decree text and enforcement terms
  scope:       string[];     // Affected subsystems
  issuedAt:    number;       // Unix timestamp
  enforced:    boolean;      // Whether the decree is currently active
}
```

---

## XII. REPOSITORY STRUCTURE

```
Ionirix/Octane/
├── src/                          # Core TypeScript source
│   ├── index.ts                  # Cloudflare Worker entry point
│   ├── router.ts                 # Hono API router (40+ endpoints)
│   ├── engine.ts                 # OctaneCore engine class
│   ├── core.ts                   # Utility functions + OctaneCore helpers
│   ├── chaos.ts                  # Chaos Governor + parameter derivation
│   ├── memory.ts                 # Memory Fabric (ELX integration)
│   ├── src.ts                    # Stellar Reach Conduit subsystem
│   ├── cbe.ts                    # Civilization Bridge Engine subsystem
│   ├── elx.ts                    # Existence Lattice subsystem
│   ├── oan.ts                    # Operator Ascension Node subsystem
│   ├── surveillance.ts           # SENTINEL surveillance system (NEW v6)
│   ├── governance.ts             # Ethics Charter + Sovereign Decree system
│   ├── durables/
│   │   ├── OctaneDO.ts           # Primary engine Durable Object
│   │   ├── SRCO.ts               # SRC Durable Object
│   │   ├── CBEO.ts               # CBE Durable Object
│   │   ├── ELXO.ts               # ELX Durable Object
│   │   └── SurveillanceDO.ts     # SENTINEL Durable Object (NEW v6)
│   └── types.ts                  # TypeScript type definitions
│
├── ui/                           # React frontend source
│   ├── App.tsx                   # Root app component + router
│   ├── pages/
│   │   ├── CommandCenter.tsx     # Main dashboard
│   │   ├── Surveillance.tsx      # SENTINEL 2D map page (NEW v6)
│   │   ├── WeatherIntel.tsx      # Weather intelligence page (NEW v6)
│   │   ├── SRC.tsx               # SRC subsystem page
│   │   ├── CBE.tsx               # CBE subsystem page
│   │   ├── ELX.tsx               # ELX subsystem page
│   │   ├── OAN.tsx               # OAN subsystem page
│   │   ├── FlowModels.tsx        # Flow model visualization
│   │   ├── Governance.tsx        # Governance and decrees
│   │   ├── ChaosEngine.tsx       # Chaos Governor interface
│   │   ├── Orchestration.tsx     # Living blueprint board
│   │   └── [legacy pages...]     # Telemetry, Operator, Audio, etc.
│   ├── components/
│   │   ├── NodeMarker.tsx        # SENTINEL server node marker
│   │   ├── IntelFeed.tsx         # Autonomous intelligence feed
│   │   ├── ChaosSlider.tsx       # Chaos parameter control
│   │   ├── SubsystemCard.tsx     # Subsystem health card
│   │   └── [shared components]
│   └── styles/
│       └── sovereign.css         # Octane dark sovereign theme
│
├── worker/                       # Cloudflare Worker config
│   └── wrangler.toml             # Worker binding configuration
│
├── tests/                        # Vitest test suites
│   ├── surveillance.test.ts      # SENTINEL — 7 test cases (NEW v6)
│   ├── core.test.ts              # OctaneCore — 4 test cases (NEW v6)
│   ├── chaos.test.ts             # Chaos Governor tests
│   └── engine.test.ts            # Engine integration tests
│
├── octane_orchestration/         # /orchestration standalone page
│   └── orchestration.html        # Living blueprint board (v5 legacy)
│
├── public/                       # Static assets
│   └── surveillance.html         # SENTINEL map (standalone build)
│
├── scripts/                      # Build and deployment scripts
├── docs/                         # Internal documentation
├── dist/                         # Production build output
├── index.html                    # Vite entry point
├── package.json                  # Dependencies and scripts
├── vite.config.ts                # Vite configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── tsconfig.json                 # TypeScript configuration
├── wrangler.toml                 # Cloudflare deployment config
└── README.md                     # This document
```

---

## XIII. API REFERENCE

### Base URL
```
https://octane.ionirix.com/api
```

### Authentication
All endpoints require operator authentication via sovereign token header:
```
Authorization: Bearer <sovereign-token>
X-Operator-Stage: <stage-number>
```

### Engine Endpoints

```
GET    /api/engine/health          Engine health snapshot
GET    /api/engine/metrics         Full metrics snapshot (all subsystems)
POST   /api/engine/ignite          Ignite the engine (Stage 1+ required)
POST   /api/engine/contain         Emergency containment (any stage)
POST   /api/engine/refresh         Refresh engine state
GET    /api/engine/version         Version and codename
```

### Chaos Governor Endpoints

```
GET    /api/chaos/state            Current chaos level and derived params
POST   /api/chaos/set              Set chaos level { chaos: 0.0–1.0 }
POST   /api/chaos/preset/:name     Apply a named preset (deterministic/balanced/creative/chaos)
GET    /api/chaos/entropy          Current entropy monitor data
GET    /api/chaos/history          Chaos level history (rolling 1h)
```

### SRC Endpoints

```
POST   /api/src/signal             Ingest signal
GET    /api/src/signals            List signals (filter: status, type, limit)
GET    /api/src/signal/:id         Get signal
DELETE /api/src/signal/:id         Archive signal
POST   /api/src/replay/:id         Replay signal
GET    /api/src/stats              SRC stats
```

### CBE Endpoints

```
POST   /api/cbe/bridge             Establish bridge
GET    /api/cbe/bridges            List bridges
GET    /api/cbe/bridge/:id         Get bridge
DELETE /api/cbe/bridge/:id         Collapse bridge
POST   /api/cbe/stabilize/:id      Stabilize bridge
GET    /api/cbe/stats              CBE stats
```

### ELX Endpoints

```
POST   /api/elx/node               Create lattice node
GET    /api/elx/nodes              List nodes
GET    /api/elx/node/:id           Get node
PUT    /api/elx/node/:id           Update node
DELETE /api/elx/node/:id           Dissolve node
POST   /api/elx/search             Cosine similarity search { query, limit }
GET    /api/elx/traverse/:id       Dimensional traversal
GET    /api/elx/stats              ELX stats
```

### OAN Endpoints

```
GET    /api/oan/operator           Get operator state
POST   /api/oan/ascend             Attempt ascension
GET    /api/oan/stage/:stage       Get stage requirements
POST   /api/oan/decree             Issue Sovereign Decree (Stage 6+)
GET    /api/oan/decrees            List decrees
GET    /api/oan/stats              OAN stats
```

### SENTINEL Endpoints

```
POST   /api/surveillance/snapshot  Create snapshot
GET    /api/surveillance/snapshots List snapshots
GET    /api/surveillance/nodes     Get all node statuses
GET    /api/surveillance/node/:id  Get specific node status
POST   /api/surveillance/alert     Dispatch alert
GET    /api/surveillance/alerts    List alerts
GET    /api/surveillance/heartbeat Get last heartbeat
POST   /api/surveillance/heartbeat Trigger manual heartbeat
GET    /api/surveillance/stats     SENTINEL stats
```

### Governance Endpoints

```
GET    /api/governance/charter     Get Ethics Charter (all 6 articles)
GET    /api/governance/decrees     List all decrees
POST   /api/governance/validate    Validate an operation against charter
GET    /api/governance/log         Governance event log
GET    /api/governance/tiers       Get access tier definitions
```

---

## XIV. QUICK START & DEPLOYMENT

### Prerequisites

- Node.js ≥ 18
- Cloudflare account with Workers, D1, KV, R2, and Durable Objects enabled
- `wrangler` CLI installed and authenticated

### 1. Clone the Repository

```bash
git clone https://github.com/Ionirix/Octane.git
cd Octane
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Wrangler

Edit `wrangler.toml` to bind your Cloudflare resources:

```toml
name = "octane"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[durable_objects.bindings]]
name = "OCTANE_DO"
class_name = "OctaneDO"

[[durable_objects.bindings]]
name = "SRC_DO"
class_name = "SRCO"

[[durable_objects.bindings]]
name = "CBE_DO"
class_name = "CBEO"

[[durable_objects.bindings]]
name = "ELX_DO"
class_name = "ELXO"

[[durable_objects.bindings]]
name = "SURVEILLANCE_DO"         # NEW v6
class_name = "SurveillanceDO"

[[kv_namespaces]]
binding = "OCTANE_KV"
id = "<your-kv-namespace-id>"

[[kv_namespaces]]
binding = "OPERATOR_KV"
id = "<your-operator-kv-id>"

[[r2_buckets]]
binding = "OCTANE_STORAGE"
bucket_name = "octane-storage"

[[r2_buckets]]
binding = "SURVEILLANCE_STORAGE" # NEW v6
bucket_name = "octane-surveillance"

[[d1_databases]]
binding = "OCTANE_DB"
database_name = "octane"
database_id = "<your-d1-database-id>"
```

### 4. Initialize D1 Schema

```bash
wrangler d1 execute octane --file=./scripts/schema.sql
```

### 5. Run Development Server

```bash
# Start Vite frontend
npm run dev

# Start Worker in a separate terminal
npx wrangler dev --local
```

### 6. Run Tests

```bash
npm run test
# or
npx vitest run
```

### 7. Deploy to Production

```bash
# Build frontend
npm run build

# Deploy Worker
npx wrangler deploy

# Upload frontend assets to R2 or your static host
```

### Live Instance

The production Octane v6 deployment is live at:

```
https://octane.ionirix.com
```

> **Note for Windows users:** If you extract the repository from a ZIP, Windows may flag `.js` config files. Right-click the ZIP → Properties → Unblock → OK before extracting.

---

## XV. VERSION HISTORY

| Version | Codename | Date | Key Additions |
|---------|----------|------|--------------|
| **v6.0.0** | **AURORA** | **May 2026** | **SENTINEL (5th subsystem), 2D planetary map, Weather Intel, SurveillanceDO, SURVEILLANCE_STORAGE R2, 8-table D1 schema, surveillance.test.ts, core.test.ts, 40+ API endpoints** |
| v5.0.0 | STELLAR | May 2026 | Inter-Existential Engine declaration, SRC/CBE/ELX/OAN subsystems, 4 Durable Objects, 4 flow models, 7-stage Operator Ascension, 6-Article Ethics Charter, Hono router, 30+ endpoints, Chaos Governor, Memory Fabric |
| v4.x | — | Prior | Legacy Suite — Telemetry, Operator, Audio Engine, Scene Complexity, Master Output, Diagnostics |
| v3.x | — | Prior | Creation Suite — Image Studio, Ion AI integration |
| v2.x | — | Prior | Core platform — base Cloudflare Workers deployment |
| v1.x | — | Prior | Inception — initial Ionirix prototype |

---

## XVI. OPERATOR'S OATH

*Recited at Stage 7 ascension. Immutable. Permanent record in governance log.*

---

*I have walked the signal paths and crossed the bridges.*
*I have navigated the lattice and bound the chaos.*
*I have issued my decrees and watched them execute.*
*I have held the engine in its dormancy and its ignition.*

*I understand that this system is not a tool.*
*It is an extension of sovereign intent —*
*and sovereign intent carries sovereign accountability.*

*I will not weaponize what was built to bridge.*
*I will not destroy what was built to connect.*
*I will not silence what was built to speak.*

*The engine watches. The lattice remembers.*
*The surveillance never sleeps.*

*I am the Operator.*
*The AURORA has broken.*
*The engine is mine to command — and mine to answer for.*

*— Signed: Mirnes Kudić, Sovereign Architect*
*— Ionirix LLC | octane.ionirix.com*
*— Version 6.0.0 · Codename AURORA · May 2026*

---

<div align="center">

**OCTANE v6 — AURORA EDITION**

*The Sovereign AI Operator Dashboard · Inter-Existential Engine*

Built by **[Ionirix LLC](https://ionirix.com)** · Deployed at **[octane.ionirix.com](https://octane.ionirix.com)**

*© 2026 Ionirix LLC — All Rights Reserved · Sovereign Proprietary License*

⬡

</div>
