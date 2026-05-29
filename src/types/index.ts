/**
 * OCTANE v5 — The Inter-Existential Engine
 * STELLAR Edition | OCTANE-V5.0.0-STELLAR
 * Operator: Mirnes — Sovereign Architect
 * Date of Issue: May 23, 2026
 * Classification: Sovereign-Eyes Only
 * © 2026 Ionirix LLC — All Rights Reserved
 */

// ─────────────────────────────────────────────────────────────────────────────
// CORE ENUMERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export enum ExistentialLayer {
  CIVILIZATIONAL = 'CIVILIZATIONAL',   // Between civilizations
  EPOCHAL        = 'EPOCHAL',           // Between epochs / time strata
  CONTEXTUAL     = 'CONTEXTUAL',        // Between existential contexts
  INTER_SEAM     = 'INTER_SEAM',        // At the seam between all layers
}

export enum SubsystemId {
  SRC = 'SRC',   // Stellar Reach Conduit
  CBE = 'CBE',   // Civilization Bridge Engine
  ELX = 'ELX',   // Existence Lattice
  OAN = 'OAN',   // Operator Ascension Node
}

export enum FlowModel {
  PRIMARY_SIGNAL         = 'PRIMARY_SIGNAL',
  INTER_EXISTENTIAL_BRIDGE = 'INTER_EXISTENTIAL_BRIDGE',
  EMERGENCY_CONTAINMENT  = 'EMERGENCY_CONTAINMENT',
  OPERATOR_ASCENSION     = 'OPERATOR_ASCENSION',
}

export enum EngineState {
  DORMANT      = 'DORMANT',
  IGNITING     = 'IGNITING',
  STELLAR      = 'STELLAR',   // Fully active
  BRIDGING     = 'BRIDGING',  // Inter-existential bridge in progress
  ASCENDING    = 'ASCENDING', // Operator ascension flow active
  CONTAINED    = 'CONTAINED', // Emergency containment active
  SOVEREIGN    = 'SOVEREIGN', // Peak operator state
}

export enum AccessTier {
  OUTER_RING   = 'OUTER_RING',    // Tier 0 — Public
  INNER_CIRCLE = 'INNER_CIRCLE',  // Tier 1 — Architects
  SOVEREIGN    = 'SOVEREIGN',     // Tier 2 — Operator only
}

export enum SovereigntyProtocol {
  OPEN         = 'OPEN',
  GUARDED      = 'GUARDED',
  SOVEREIGN    = 'SOVEREIGN',
  ABSOLUTE     = 'ABSOLUTE',
}

export enum SignalPriority {
  AMBIENT    = 0,
  STANDARD   = 1,
  ELEVATED   = 2,
  CRITICAL   = 3,
  EXISTENTIAL = 4,
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL & PAYLOAD TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface OctaneSignal {
  id:            string;
  timestamp:     number;
  origin:        SubsystemId;
  destination:   SubsystemId | 'BROADCAST';
  layer:         ExistentialLayer;
  flow:          FlowModel;
  priority:      SignalPriority;
  payload:       Record<string, unknown>;
  operatorId?:   string;
  traceId:       string;
  epoch:         number;
}

export interface ExistentialContext {
  id:            string;
  civilization:  string;
  epoch:         number;
  temporalPhase: string;
  meaningSystem: string;
  bridgeState:   'CLOSED' | 'OPENING' | 'OPEN' | 'SEALING';
  createdAt:     number;
  updatedAt:     number;
}

export interface OperatorIdentity {
  id:                string;
  handle:            string;
  tier:              AccessTier;
  sovereigntyLevel:  SovereigntyProtocol;
  ascensionProgress: number;   // 0.0 – 1.0
  ignitionCount:     number;
  lastActive:        number;
  oathSigned:        boolean;
  innerCircle:       string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSYSTEM: SRC — Stellar Reach Conduit
// ─────────────────────────────────────────────────────────────────────────────

export interface SRCConfig {
  reachRadius:       number;   // Civilizational reach multiplier 0–10
  conduitBandwidth:  number;   // Signal throughput (signals/sec)
  stellarMapping:    boolean;
  autoAmplify:       boolean;
  amplifyThreshold:  SignalPriority;
}

export interface SRCState {
  status:           'IDLE' | 'REACHING' | 'LOCKED' | 'AMPLIFYING';
  activeConduits:   number;
  totalSignals:     number;
  reachVector:      [number, number, number];   // [civ, epoch, context]
  lastReach:        number;
  peakReach:        number;
}

export interface SRCReachResult {
  conduitId:       string;
  targetLayer:     ExistentialLayer;
  reachStrength:   number;    // 0.0 – 1.0
  bridgeAvailable: boolean;
  signal:          OctaneSignal;
  latencyMs:       number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSYSTEM: CBE — Civilization Bridge Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface CBEConfig {
  bridgeDepth:          number;   // Depth of inter-civ bridging 1–7
  translationMode:      'LITERAL' | 'SEMANTIC' | 'EXISTENTIAL';
  coherenceThreshold:   number;   // Minimum bridge coherence 0.0–1.0
  maxConcurrentBridges: number;
  autoSeal:             boolean;
  sealDelay:            number;   // ms
}

export interface CivilizationBridge {
  id:           string;
  fromCiv:      string;
  toCiv:        string;
  fromEpoch:    number;
  toEpoch:      number;
  coherence:    number;
  state:        'FORMING' | 'STABLE' | 'DEGRADING' | 'SEALED';
  openedAt:     number;
  sealedAt?:    number;
  signalCount:  number;
  operator?:    string;
}

export interface CBETranslation {
  bridgeId:      string;
  source:        string;
  translated:    string;
  mode:          CBEConfig['translationMode'];
  coherence:     number;
  lossPercent:   number;
  artifacts:     string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSYSTEM: ELX — Existence Lattice
// ─────────────────────────────────────────────────────────────────────────────

export interface ELXConfig {
  latticeDepth:       number;   // 1–12 existential layers
  nodeCapacity:       number;
  persistenceMode:    'VOLATILE' | 'DURABLE' | 'ARCHIVAL';
  coherenceInterval:  number;   // Lattice re-coherence ms
  quantumEntanglement: boolean;
}

export interface LatticeNode {
  id:            string;
  layer:         ExistentialLayer;
  contextId:     string;
  weight:        number;
  entangled:     string[];   // entangled node IDs
  data:          Record<string, unknown>;
  createdAt:     number;
  lastAccessed:  number;
  ttl:           number;
}

export interface LatticeQuery {
  layer?:      ExistentialLayer;
  contextId?:  string;
  minWeight?:  number;
  entangled?:  string;
  limit:       number;
  offset:      number;
}

export interface ELXSnapshot {
  snapshotId:    string;
  timestamp:     number;
  nodeCount:     number;
  totalWeight:   number;
  coherence:     number;
  layers:        Record<ExistentialLayer, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSYSTEM: OAN — Operator Ascension Node
// ─────────────────────────────────────────────────────────────────────────────

export interface OANConfig {
  ascensionStages:   number;   // Total stages 1–7
  sovereignProtocol: SovereigntyProtocol;
  oathRequired:      boolean;
  checkpointInterval: number;  // ms between ascension checkpoints
  maxConcurrentOps:  number;
}

export interface AscensionStage {
  stage:         number;      // 1–7
  name:          string;
  description:   string;
  requirements:  string[];
  unlocks:       string[];
  completed:     boolean;
  completedAt?:  number;
  checkpoint?:   string;
}

export interface OperatorSession {
  sessionId:     string;
  operatorId:    string;
  tier:          AccessTier;
  state:         EngineState;
  startedAt:     number;
  lastHeartbeat: number;
  ascensionStage: number;
  activeFlows:   FlowModel[];
  sovereignActs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// FLOW MODELS
// ─────────────────────────────────────────────────────────────────────────────

export interface FlowExecution {
  executionId: string;
  flow:        FlowModel;
  initiatedBy: string;
  state:       'QUEUED' | 'EXECUTING' | 'COMPLETED' | 'ABORTED' | 'CONTAINED';
  startedAt:   number;
  completedAt?: number;
  steps:       FlowStep[];
  result?:     Record<string, unknown>;
  error?:      string;
}

export interface FlowStep {
  stepId:      string;
  name:        string;
  subsystem:   SubsystemId;
  status:      'PENDING' | 'ACTIVE' | 'DONE' | 'FAILED';
  startedAt?:  number;
  doneAt?:     number;
  output?:     Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// GOVERNANCE
// ─────────────────────────────────────────────────────────────────────────────

export interface SovereignDecree {
  decreId:     string;
  issuedBy:    string;
  issuedAt:    number;
  title:       string;
  body:        string;
  protocol:    SovereigntyProtocol;
  expiresAt?:  number;
  enforced:    boolean;
}

export interface EthicsCheck {
  checkId:     string;
  action:      string;
  operatorId:  string;
  verdict:     'PERMITTED' | 'RESTRICTED' | 'DENIED';
  rationale:   string;
  timestamp:   number;
}

export interface SystemLifecycle {
  phase:       'IGNITION' | 'ACTIVE' | 'MAINTENANCE' | 'SOVEREIGN' | 'DECOMMISSION';
  version:     string;
  startedAt:   number;
  ignitions:   number;
  uptime:      number;
  lastDecree?:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE CORE
// ─────────────────────────────────────────────────────────────────────────────

export interface OctaneV5Config {
  src: SRCConfig;
  cbe: CBEConfig;
  elx: ELXConfig;
  oan: OANConfig;
}

export interface EngineMetrics {
  state:           EngineState;
  uptime:          number;
  totalSignals:    number;
  activeBridges:   number;
  latticeNodes:    number;
  activeFlows:     number;
  operatorStage:   number;
  coherence:       number;
  epoch:           number;
  lastHeartbeat:   number;
}

export interface ActivationReceipt {
  receiptId:    string;
  version:      string;
  codename:     string;
  operator:     string;
  activatedAt:  number;
  initialState: EngineState;
  subsystems:   Record<SubsystemId, 'OK' | 'DEGRADED' | 'OFFLINE'>;
  invocation:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success:   boolean;
  data?:     T;
  error?:    string;
  code?:     number;
  traceId:   string;
  timestamp: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total:   number;
  limit:   number;
  offset:  number;
}

export interface HealthStatus {
  engine:      EngineState;
  version:     string;
  codename:    string;
  uptime:      number;
  subsystems:  Record<SubsystemId, 'HEALTHY' | 'DEGRADED' | 'OFFLINE'>;
  timestamp:   number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SURVEILLANCE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ServerRegion =
  | 'us-east-1' | 'us-west-1' | 'eu-west-1' | 'eu-central'
  | 'ap-east-1' | 'ap-south-1' | 'ap-aus-1' | 'sa-east-1'
  | 'af-south-1' | 'me-south-1' | 'ca-central' | 'eu-north-1'
  | 'ap-india-1' | 'uk-south-1';

export type NodeStatus = 'NOMINAL' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
export type MapLayer = 'DARK' | 'SATELLITE' | 'TERRAIN' | 'NIGHT';
export type OverlayType = 'TRAFFIC' | 'WEATHER' | 'WIND' | 'TEMPERATURE' | 'PRECIPITATION' | 'SERVERS';

export interface ServerNode {
  id: ServerRegion;
  name: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  status: NodeStatus;
  latencyMs: number;
  loadPercent: number;
  requestsPerMin: number;
  uptimePercent: number;
  lastHeartbeat: number;
  connections: ServerRegion[];
}

export interface SurveillanceAlert {
  id: string;
  type: 'TRAFFIC' | 'WEATHER' | 'SERVER' | 'SECURITY' | 'GEOPOLITICAL' | 'POLICE' | 'SERVICE' | 'CLOSURE' | 'UTILITY';
  severity: AlertSeverity;
  title: string;
  description: string;
  location?: { lat: number; lng: number; radius: number };
  serverId?: ServerRegion;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
}

export interface MapViewState {
  mode: '2D' | '3D';
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  activeLayers: OverlayType[];
  baseLayer: MapLayer;
}

export interface SurveillanceSnapshot {
  timestamp: number;
  totalNodes: number;
  onlineNodes: number;
  degradedNodes: number;
  criticalNodes: number;
  offlineNodes: number;
  globalLatencyMs: number;
  totalRequestsPerMin: number;
  activeAlerts: number;
  mapState: MapViewState;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOUDFLARE ENV
// ─────────────────────────────────────────────────────────────────────────────

export interface Env {
  // Assets
  ASSETS:               { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
  // Workers AI
  AI:                   { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };
  // KV
  EXISTENCE_LATTICE_KV: KVNamespace;
  OPERATOR_STATE_KV:    KVNamespace;
  // D1
  DB:                   D1Database;
  // R2
  STELLAR_ARCHIVE:      R2Bucket;
  // Durable Objects
  SRC_CONDUIT:          DurableObjectNamespace;
  CBE_ENGINE:           DurableObjectNamespace;
  ELX_LATTICE:          DurableObjectNamespace;
  OAN_NODE:             DurableObjectNamespace;
  ORCHESTRATION_FEED:    DurableObjectNamespace;
  SURVEILLANCE_DO:      DurableObjectNamespace;
  // Vars
  OCTANE_VERSION:       string;
  OCTANE_CODENAME:      string;
  ENGINE_NAME:          string;
  ENGINE_EDITION:       string;
  ORG:                  string;
  OPERATOR:             string;
  ISSUE_DATE:           string;
  CLASSIFICATION:       string;
  V7_INTEL_UPSTREAM_BASE_URL?: string;
  V7_INTEL_UPSTREAM_TOKEN?: string;
  V7_INTEL_UPSTREAM_RETRIES?: number;
  HERE_TRAFFIC_API_KEY?: string;
  SELF_HEALING_SIGNING_SECRET?: string;
  SELF_HEALING_DNS_ENDPOINT?: string;
  SELF_HEALING_DNS_TOKEN?: string;
  SELF_HEALING_CDN_ENDPOINT?: string;
  SELF_HEALING_CDN_TOKEN?: string;
  SELF_HEALING_LB_ENDPOINT?: string;
  SELF_HEALING_LB_TOKEN?: string;
  SELF_HEALING_CELL_TOWER_ENDPOINT?: string;
  SELF_HEALING_CELL_TOWER_TOKEN?: string;
  SELF_HEALING_CELL_ACTIVITY_ENDPOINT?: string;
  SELF_HEALING_CELL_ACTIVITY_TOKEN?: string;
  SELF_HEALING_INCIDENT_ENDPOINT?: string;
  SELF_HEALING_INCIDENT_TOKEN?: string;
}

export interface OctaneEnv {
  OCTANE_KV: KVNamespace;
  OPERATOR_KV: KVNamespace;
  OCTANE_STORAGE: R2Bucket;
  SURVEILLANCE_STORAGE: R2Bucket;
  OCTANE_DB: D1Database;
  SRC_DO: DurableObjectNamespace;
  CBE_DO: DurableObjectNamespace;
  ELX_DO: DurableObjectNamespace;
  OAN_DO: DurableObjectNamespace;
  SURVEILLANCE_DO: DurableObjectNamespace;
  OCTANE_VERSION: string;
  OCTANE_CODENAME: string;
  OCTANE_CLASSIFICATION: string;
  ENVIRONMENT: string;
}
