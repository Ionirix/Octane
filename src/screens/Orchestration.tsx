import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Link } from 'react-router-dom'
import { getChaosColor } from '@theme/tokens'
import { useChaosStore } from '@state/chaos'
import { useAudioStore } from '@state/audio'
import { useWebSocket } from '../hooks'
import { resolveWsUrl } from '../sdk/runtime'
import { Panel } from '@components/primitives/Panel'
import { Fader } from '@components/controls/Fader'
import { Toggle } from '@components/controls/Toggle'
import { SparkLine } from '@components/charts/SparkLine'

type NodeId = 'ion' | 'src' | 'cbe' | 'elx' | 'oan' | 'img' | 'mem' | 'flow' | 'gov' | 'sig' | 'task' | 'epoch'

interface BoardNode {
  id: NodeId
  icon: string
  title: string
  color: string
  x: number
  y: number
  metrics: [string, string, string]
  tag: string
  activity: number
  expanded: boolean
}

type NodeSeries = Record<NodeId, number[]>

interface TaskItem {
  id: number
  name: string
  path: string
  status: 'running' | 'queued' | 'done'
  depth: number
  progress: number
  source: string
  createdAt: number
}

interface ModuleItem {
  id: number
  label: string
  detail: string
  kind: 'baseline' | 'proxy'
  sourceId: NodeId
  targetId: NodeId
  x: number
  y: number
  ttl: number
  maxTtl: number
  createdAt: number
  retiring: boolean
  expanded: boolean
}

interface ProxyModuleEvent {
  id: number
  label: string
  detail: string
  sourceId: NodeId
  targetId: NodeId
  ttlMin: number
  ttlRange: number
}

interface LogItem {
  id: number
  ts: string
  source: string
  message: string
  kind: 'ok' | 'warn' | 'err'
}

interface TaskBurstFx {
  id: number
  nodeId: NodeId
  kind: 'spawn' | 'complete'
  ttl: number
  maxTtl: number
}

interface NodeFlashFx {
  id: number
  nodeId: NodeId
  color: string
  ttl: number
  maxTtl: number
}

interface WireRippleFx {
  id: number
  edgeId: string
  ttl: number
  maxTtl: number
}

interface OrchestrationFeedSnapshot {
  type?: 'orchestration'
  ts?: number
  tasks?: TaskItem[]
  archive?: TaskItem[]
  logs?: LogItem[]
  metrics?: {
    activeTasks?: number
    archivedTasks?: number
    tasksPerMin?: number
    systemState?: string
  }
}

interface AudioBands {
  bass: number
  mid: number
  treble: number
  pulse: number
  beat: number
}

const PERFORMANCE_START = Date.now()
const BOARD_NODE_WIDTH = 250
const BOARD_NODE_HEIGHT = 140
const BOARD_MIN_ZOOM = 0.55
const BOARD_MAX_ZOOM = 2.4
const BOARD_WHEEL_ZOOM_SENSITIVITY = 0.0015

const NODE_DEFS: Omit<BoardNode, 'activity' | 'expanded'>[] = [
  { id: 'ion', icon: '⬡', title: 'Ion AI Core', color: '#00f5ff', x: 52, y: 18, metrics: ['Inference/s', 'Context Tokens', 'Temp'], tag: 'CORE ROUTER' },
  { id: 'src', icon: '◎', title: 'Stellar Reach Conduit', color: '#00f5ff', x: 16, y: 16, metrics: ['Conduits', 'Reach Str', 'Bandwidth'], tag: 'SRC' },
  { id: 'cbe', icon: '⊕', title: 'Civilization Bridge', color: '#7b61ff', x: 30, y: 38, metrics: ['Bridges', 'Coherence', 'Translated'], tag: 'CBE' },
  { id: 'elx', icon: '◈', title: 'Existence Lattice', color: '#00f5ff', x: 57, y: 46, metrics: ['Nodes', 'Coherence', 'Entangled'], tag: 'ELX' },
  { id: 'oan', icon: '✦', title: 'Ascension Node', color: '#ffd700', x: 79, y: 24, metrics: ['Stage', 'Decrees', 'Uptime'], tag: 'OAN' },
  { id: 'img', icon: '◧', title: 'Image Studio', color: '#7b61ff', x: 83, y: 49, metrics: ['Queue', 'Rendered', 'GPU%'], tag: 'IMG-GEN' },
  { id: 'mem', icon: '▣', title: 'Memory Fabric', color: '#00ffaa', x: 17, y: 58, metrics: ['Working', 'Episodic', 'Semantic'], tag: 'MEMORY' },
  { id: 'flow', icon: '⇌', title: 'Flow Orchestrator', color: '#7b61ff', x: 42, y: 67, metrics: ['Active', 'Queued', 'Done'], tag: 'FLOWS' },
  { id: 'gov', icon: '⚖', title: 'Governance Engine', color: '#ffd700', x: 76, y: 70, metrics: ['Decrees', 'Ethics', 'Permits'], tag: 'GOV' },
  { id: 'sig', icon: '〜', title: 'Signal Router', color: '#00f5ff', x: 6, y: 31, metrics: ['In/s', 'Out/s', 'Dropped'], tag: 'ROUTER' },
  { id: 'task', icon: '⊞', title: 'Task Processor', color: '#00ffaa', x: 61, y: 78, metrics: ['Running', 'Done', 'Failed'], tag: 'TASKS' },
  { id: 'epoch', icon: '◷', title: 'Epoch Clock', color: '#ffd700', x: 88, y: 39, metrics: ['Epoch', 'Drift', 'Sync'], tag: 'TIME' },
]

const EDGE_DEFS: Array<{ from: NodeId; to: NodeId; label: string; color: string }> = [
  { from: 'sig', to: 'src', label: 'signals', color: '#00f5ff' },
  { from: 'src', to: 'ion', label: 'reach', color: '#00f5ff' },
  { from: 'src', to: 'cbe', label: 'bridge-req', color: '#7b61ff' },
  { from: 'ion', to: 'cbe', label: 'translate', color: '#7b61ff' },
  { from: 'ion', to: 'elx', label: 'lattice-write', color: '#00f5ff' },
  { from: 'cbe', to: 'elx', label: 'context', color: '#00f5ff' },
  { from: 'ion', to: 'oan', label: 'sovereign', color: '#ffd700' },
  { from: 'ion', to: 'mem', label: 'memory-r/w', color: '#00ffaa' },
  { from: 'ion', to: 'img', label: 'render', color: '#7b61ff' },
  { from: 'elx', to: 'flow', label: 'state', color: '#7b61ff' },
  { from: 'flow', to: 'task', label: 'dispatch', color: '#00ffaa' },
  { from: 'task', to: 'gov', label: 'audit', color: '#ffd700' },
  { from: 'gov', to: 'oan', label: 'decree', color: '#ffd700' },
  { from: 'oan', to: 'flow', label: 'ascend', color: '#ffd700' },
  { from: 'epoch', to: 'elx', label: 'sync', color: '#ffd700' },
  { from: 'mem', to: 'cbe', label: 'recall', color: '#00ffaa' },
]

const NODE_LOG_LINES: Record<NodeId, string[]> = {
  ion: ['Inference routed', 'Context window: 128k', 'Temperature: 0.72'],
  src: ['Conduit opened', 'Reach: 0.87', 'Stellar lock acquired'],
  cbe: ['Bridge stable', 'Translation: EXISTENTIAL', 'Coherence: 0.94'],
  elx: ['Node written', 'Entanglement: 3', 'Snapshot taken'],
  oan: ['Stage 7: SOVEREIGN', 'Decree issued', 'Ascension logged'],
  img: ['Render queued', 'GPU: 61%', 'Output: 1024×1024'],
  mem: ['Working: 6.1K/8K', 'Episodic recall', 'Noise: 0%'],
  flow: ['Flow dispatched', '4 active', 'Primary signal'],
  gov: ['Ethics: PERMITTED', 'Charter enforced', 'Audit logged'],
  sig: ['120 sig/s in', '98 sig/s out', '0 dropped'],
  task: ['Task # active', 'Queue: 3', 'Done: 42'],
  epoch: ['Epoch synced', 'Drift: 0.002ms', 'Sync: OK'],
}

const TASK_TEMPLATES = [
  { name: 'Stellar Reach', path: ['sig', 'src', 'ion', 'elx'], source: 'SRC', depth: 0 },
  { name: 'Bridge Translate', path: ['src', 'cbe', 'elx', 'flow'], source: 'CBE', depth: 1 },
  { name: 'Operator Ascension', path: ['ion', 'oan', 'gov', 'flow'], source: 'OAN', depth: 0 },
  { name: 'Memory Recall', path: ['mem', 'cbe', 'ion', 'elx'], source: 'MEMORY', depth: 1 },
  { name: 'Image Render', path: ['ion', 'img'], source: 'IMG-GEN', depth: 0 },
  { name: 'Governance Check', path: ['task', 'gov', 'oan'], source: 'GOV', depth: 1 },
  { name: 'Lattice Entangle', path: ['elx', 'flow', 'task'], source: 'ELX', depth: 0 },
  { name: 'Signal Route', path: ['sig', 'src', 'ion'], source: 'ROUTER', depth: 0 },
  { name: 'Flow Dispatch', path: ['flow', 'task', 'gov'], source: 'FLOWS', depth: 1 },
  { name: 'Epoch Sync', path: ['epoch', 'elx', 'ion'], source: 'TIME', depth: 0 },
]

const IMPORTANT_NODE_IDS = new Set<NodeId>(['ion', 'oan'])

const SOURCE_TO_NODE_ID: Record<string, NodeId> = {
  SRC: 'src',
  CBE: 'cbe',
  OAN: 'oan',
  MEMORY: 'mem',
  'IMG-GEN': 'img',
  GOV: 'gov',
  ELX: 'elx',
  ROUTER: 'sig',
  FLOWS: 'flow',
  TIME: 'epoch',
  TASK: 'task',
  ION: 'ion',
  SYS: 'ion',
}

function edgeId(from: NodeId, to: NodeId) {
  return `${from}->${to}`
}

function resolveTaskNodeId(task: Pick<TaskItem, 'source' | 'path'>): NodeId {
  const source = String(task.source || '').toUpperCase()
  if (source in SOURCE_TO_NODE_ID) return SOURCE_TO_NODE_ID[source]

  const pathText = String(task.path || '').toLowerCase()
  if (pathText.includes('ion')) return 'ion'
  if (pathText.includes('ascension') || pathText.includes('oan')) return 'oan'
  if (pathText.includes('lattice') || pathText.includes('elx')) return 'elx'
  if (pathText.includes('bridge') || pathText.includes('cbe')) return 'cbe'
  if (pathText.includes('stellar') || pathText.includes('src')) return 'src'
  if (pathText.includes('flow')) return 'flow'
  if (pathText.includes('memory')) return 'mem'
  if (pathText.includes('image')) return 'img'
  if (pathText.includes('governance')) return 'gov'
  if (pathText.includes('epoch')) return 'epoch'
  return 'ion'
}

function resolveTargetNodeId(sourceId: NodeId): NodeId {
  const candidates = EDGE_DEFS.filter(edge => edge.from === sourceId).map(edge => edge.to)
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)]
  }
  return sourceId === 'ion' ? 'elx' : 'ion'
}

function compactText(value: string, max = 44) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function smoothstep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function hashNoise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false })
}

function percentPosition(x: number, y: number) {
  return { left: `${x}%`, top: `${y}%` }
}

function cubicPoint(
  start: { x: number; y: number },
  control1: { x: number; y: number },
  control2: { x: number; y: number },
  end: { x: number; y: number },
  progress: number,
) {
  const t = clamp01(progress)
  const mt = 1 - t
  const mt2 = mt * mt
  const t2 = t * t
  return {
    x: mt2 * mt * start.x + 3 * mt2 * t * control1.x + 3 * mt * t2 * control2.x + t2 * t * end.x,
    y: mt2 * mt * start.y + 3 * mt2 * t * control1.y + 3 * mt * t2 * control2.y + t2 * t * end.y,
  }
}

function buildBoardNodes(): BoardNode[] {
  return NODE_DEFS.map(def => ({ ...def, activity: 0.25 + Math.random() * 0.35, expanded: def.id === 'ion' }))
}

function buildNodeSeries(): NodeSeries {
  return NODE_DEFS.reduce((series, node) => {
    series[node.id] = Array.from({ length: 28 }, () => 30 + Math.random() * 35)
    return series
  }, {} as NodeSeries)
}

export default function Orchestration() {
  const { chaos, entropy, locked, setChaos, lockChaos, applyPreset } = useChaosStore()
  const { masterVuL, masterVuR, masterPeak, masterMuted } = useAudioStore(state => ({
    masterVuL: state.masterVuL,
    masterVuR: state.masterVuR,
    masterPeak: state.masterPeak,
    masterMuted: state.masterMuted,
  }))
  const color = getChaosColor(chaos)

  const [nodes, setNodes] = useState<BoardNode[]>(() => buildBoardNodes())
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [archive, setArchive] = useState<TaskItem[]>([])
  const [logs, setLogs] = useState<LogItem[]>([])
  const [modules, setModules] = useState<ModuleItem[]>([])
  const [nodeSeries, setNodeSeries] = useState<NodeSeries>(() => buildNodeSeries())
  const [audioStatus, setAudioStatus] = useState('AUDIO OFF')
  const [audioLevel, setAudioLevel] = useState(0)
  const [audioBands, setAudioBands] = useState<AudioBands>({ bass: 0, mid: 0, treble: 0, pulse: 0, beat: 0 })
  const [taskBursts, setTaskBursts] = useState<TaskBurstFx[]>([])
  const [nodeFlashes, setNodeFlashes] = useState<NodeFlashFx[]>([])
  const [wireRipples, setWireRipples] = useState<WireRippleFx[]>([])
  const [boardSize, setBoardSize] = useState({ width: 1, height: 1 })
  const [now, setNow] = useState(Date.now())
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [orchestrationConnected, setOrchestrationConnected] = useState(false)

  const boardRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  const tasksThisMinute = useRef(0)
  const nextTaskId = useRef(1)
  const nextModuleId = useRef(1)
  const nextLogId = useRef(1)
  const nextFxId = useRef(1)
  const audioRef = useRef<{
    context?: AudioContext
    analyser?: AnalyserNode
    source?: MediaStreamAudioSourceNode
    stream?: MediaStream
    raf?: number
  }>({})
  const panGestureRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const nodeDragRef = useRef<{ id: NodeId; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)
  const moduleDragRef = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)
  const nodeClickBlockRef = useRef(false)
  const moduleClickBlockRef = useRef(false)
  const moduleDragListenersRef = useRef<{
    move?: (event: PointerEvent) => void
    up?: (event: PointerEvent) => void
  }>({})
  const nodeDragListenersRef = useRef<{
    move?: (event: PointerEvent) => void
    up?: (event: PointerEvent) => void
  }>({})
  const lastBeatRef = useRef(0)
  const lastModuleOpenAtRef = useRef(0)
  const lastModuleCloseAtRef = useRef(0)
  const liveTaskIdsRef = useRef<Set<number>>(new Set())
  const liveArchiveIdsRef = useRef<Set<number>>(new Set())
  const liveLogIdsRef = useRef<Set<number>>(new Set())
  const proxyEventQueueRef = useRef<ProxyModuleEvent[]>([])
  const lastProxyEventAtRef = useRef(0)

  const nodesRef = useRef(nodes)
  const tasksRef = useRef(tasks)
  const archiveRef = useRef(archive)
  const modulesRef = useRef(modules)
  const nodeSeriesRef = useRef(nodeSeries)
  const audioLevelRef = useRef(audioLevel)
  const audioBandsRef = useRef(audioBands)
  const logsRef = useRef(logs)
  const chaosRef = useRef(chaos)
  const entropyRef = useRef(entropy)
  const orchestrationConnectedRef = useRef(false)

  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => { archiveRef.current = archive }, [archive])
  useEffect(() => { modulesRef.current = modules }, [modules])
  useEffect(() => { nodeSeriesRef.current = nodeSeries }, [nodeSeries])
  useEffect(() => { audioLevelRef.current = audioLevel }, [audioLevel])
  useEffect(() => { audioBandsRef.current = audioBands }, [audioBands])
  useEffect(() => { logsRef.current = logs }, [logs])
  useEffect(() => { chaosRef.current = chaos }, [chaos])
  useEffect(() => { entropyRef.current = entropy }, [entropy])
  useEffect(() => { orchestrationConnectedRef.current = orchestrationConnected }, [orchestrationConnected])
  useEffect(() => { panRef.current = pan }, [pan])
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  const triggerTaskSpawnFx = useCallback((nodeId: NodeId) => {
    const id = nextFxId.current++
    setTaskBursts(prev => [{ id, nodeId, kind: 'spawn' as const, ttl: 1100, maxTtl: 1100 }, ...prev].slice(0, 24))
  }, [])

  const enqueueProxyModuleEvent = useCallback((event: Omit<ProxyModuleEvent, 'id'>) => {
    const nowTs = Date.now()
    const minIntervalMs = event.label === 'task-proxy' || event.label === 'archive-proxy' ? 240 : 760
    if (nowTs - lastProxyEventAtRef.current < minIntervalMs) return
    lastProxyEventAtRef.current = nowTs

    const id = nextFxId.current++
    proxyEventQueueRef.current = [{ id, ...event }, ...proxyEventQueueRef.current].slice(0, 20)
  }, [])

  const triggerTaskCompleteFx = useCallback((nodeId: NodeId) => {
    const flashId = nextFxId.current++
    const rippleBaseId = nextFxId.current++
    const connectedEdges = EDGE_DEFS.filter(edge => edge.from === nodeId || edge.to === nodeId)

    setNodeFlashes(prev => [{ id: flashId, nodeId, color: '#22c55e', ttl: 1300, maxTtl: 1300 }, ...prev].slice(0, 18))
    setTaskBursts(prev => [{ id: nextFxId.current++, nodeId, kind: 'complete' as const, ttl: 1250, maxTtl: 1250 }, ...prev].slice(0, 24))
    setWireRipples(prev => [
      ...connectedEdges.map((edge, index) => ({
        id: rippleBaseId + index,
        edgeId: edgeId(edge.from, edge.to),
        ttl: 1150,
        maxTtl: 1150,
      })),
      ...prev,
    ].slice(0, 60))
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTaskBursts(prev => prev.map(effect => ({ ...effect, ttl: effect.ttl - 120 })).filter(effect => effect.ttl > 0))
      setNodeFlashes(prev => prev.map(effect => ({ ...effect, ttl: effect.ttl - 120 })).filter(effect => effect.ttl > 0))
      setWireRipples(prev => prev.map(effect => ({ ...effect, ttl: effect.ttl - 120 })).filter(effect => effect.ttl > 0))
    }, 120)

    return () => window.clearInterval(timer)
  }, [])

  const applyLiveSnapshot = useCallback((snapshot: OrchestrationFeedSnapshot) => {
    const nextTasks = Array.isArray(snapshot.tasks)
      ? snapshot.tasks
          .map(task => ({
            id: Number(task.id),
            name: String(task.name ?? 'Untitled Task'),
            path: String(task.path ?? ''),
            status: (task.status === 'queued' || task.status === 'done' ? task.status : 'running') as TaskItem['status'],
            depth: Number(task.depth ?? 0),
            progress: Number(task.progress ?? 0),
            source: String(task.source ?? 'SYS'),
            createdAt: Number(task.createdAt ?? Date.now()),
          }))
          .filter(task => Number.isFinite(task.id))
          .slice(0, 10)
      : []

    const nextArchive = Array.isArray(snapshot.archive)
      ? snapshot.archive
          .map(task => ({
            id: Number(task.id),
            name: String(task.name ?? 'Archived Task'),
            path: String(task.path ?? ''),
            status: 'done' as const,
            depth: Number(task.depth ?? 0),
            progress: 100,
            source: String(task.source ?? 'SYS'),
            createdAt: Number(task.createdAt ?? Date.now()),
          }))
          .filter(task => Number.isFinite(task.id))
          .slice(0, 14)
      : []

    const nextLogs = Array.isArray(snapshot.logs)
      ? snapshot.logs
          .map(entry => ({
            id: Number(entry.id),
            ts: String(entry.ts ?? formatTime(Date.now())),
            source: String(entry.source ?? 'SYS'),
            message: String(entry.message ?? ''),
            kind: (entry.kind === 'warn' || entry.kind === 'err' ? entry.kind : 'ok') as LogItem['kind'],
          }))
          .filter(entry => Number.isFinite(entry.id))
          .slice(0, 28)
      : []

    setTasks(nextTasks)
    setArchive(nextArchive)
    setLogs(nextLogs)

    const previousTasks = liveTaskIdsRef.current
    const previousArchive = liveArchiveIdsRef.current
    nextTasks.forEach(task => {
      if (!previousTasks.has(task.id)) {
        const sourceId = resolveTaskNodeId(task)
        triggerTaskSpawnFx(sourceId)
        enqueueProxyModuleEvent({
          label: 'task-proxy',
          detail: `${compactText(task.name, 28)} · ${task.status}`,
          sourceId,
          targetId: resolveTargetNodeId(sourceId),
          ttlMin: 1800,
          ttlRange: 1800,
        })
      }
    })
    nextArchive.forEach(task => {
      if (!previousArchive.has(task.id)) {
        const sourceId = resolveTaskNodeId(task)
        triggerTaskCompleteFx(sourceId)
        enqueueProxyModuleEvent({
          label: 'archive-proxy',
          detail: `${compactText(task.name, 28)} · done`,
          sourceId,
          targetId: resolveTargetNodeId(sourceId),
          ttlMin: 1600,
          ttlRange: 1400,
        })
      }
    })
    const previousLogs = liveLogIdsRef.current
    nextLogs.forEach(entry => {
      if (previousLogs.has(entry.id)) return
      if (entry.kind === 'ok' && Math.random() > 0.3) return
      const sourceId = SOURCE_TO_NODE_ID[String(entry.source || '').toUpperCase()] ?? 'ion'
      enqueueProxyModuleEvent({
        label: `${entry.kind}-proxy`,
        detail: compactText(entry.message, 40),
        sourceId,
        targetId: resolveTargetNodeId(sourceId),
        ttlMin: 1400,
        ttlRange: 1200,
      })
    })
    liveTaskIdsRef.current = new Set(nextTasks.map(task => task.id))
    liveArchiveIdsRef.current = new Set(nextArchive.map(task => task.id))
    liveLogIdsRef.current = new Set(nextLogs.map(entry => entry.id))

    tasksThisMinute.current = snapshot.metrics?.tasksPerMin ?? Math.max(nextTasks.length * 2, 1)
    setOrchestrationConnected(true)
  }, [enqueueProxyModuleEvent, triggerTaskCompleteFx, triggerTaskSpawnFx])

  useWebSocket(resolveWsUrl('/ws/orchestration'), {
    reconnect: true,
    reconnectMs: 4000,
    onOpen: () => setOrchestrationConnected(true),
    onClose: () => setOrchestrationConnected(false),
    onMessage: (data) => {
      if (!data || typeof data !== 'object') return
      const payload = data as OrchestrationFeedSnapshot & { data?: OrchestrationFeedSnapshot }
      const snapshot = payload.type === 'orchestration' ? payload : payload.data
      if (!snapshot) return
      applyLiveSnapshot(snapshot)
    },
  })

  useEffect(() => {
    document.title = 'OCTANE v6 — /orchestration'
  }, [])

  useEffect(() => {
    const updateSize = () => {
      if (!boardRef.current) return
      setBoardSize({
        width: Math.max(1, boardRef.current.clientWidth),
        height: Math.max(1, boardRef.current.clientHeight),
      })
    }

    updateSize()
    const observer = typeof ResizeObserver !== 'undefined' && boardRef.current
      ? new ResizeObserver(updateSize)
      : null
    if (observer && boardRef.current) observer.observe(boardRef.current)
    window.addEventListener('resize', updateSize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [])

  useEffect(() => {
    let raf = 0
    let lastFrame = 0
    const minFrameMs = 1000 / 30

    const tick = (timestamp: number) => {
      if (timestamp - lastFrame >= minFrameMs) {
        lastFrame = timestamp
        setNow(Date.now())
      }
      raf = window.requestAnimationFrame(tick)
    }

    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    setNodes(buildBoardNodes())
    setNodeSeries(buildNodeSeries())
  }, [])

  const beginBoardPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement | null)?.closest('[data-module-card="true"]') || (event.target as HTMLElement | null)?.closest('[data-node-card="true"]')) return
    const board = boardRef.current
    if (!board) return
    event.preventDefault()
    panGestureRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: panRef.current.x,
      originY: panRef.current.y,
    }
    board.setPointerCapture(event.pointerId)
  }

  const moveBoardPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = panGestureRef.current
    if (!gesture) return
    setPan({
      x: gesture.originX + (event.clientX - gesture.startX),
      y: gesture.originY + (event.clientY - gesture.startY),
    })
  }

  const endBoardPan = () => {
    panGestureRef.current = null
  }

  const handleBoardWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const board = boardRef.current
    if (!board) return

    const rect = board.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const currentZoom = zoomRef.current
    const currentPan = panRef.current
    const zoomFactor = Math.exp(-event.deltaY * BOARD_WHEEL_ZOOM_SENSITIVITY)
    const nextZoom = Math.max(BOARD_MIN_ZOOM, Math.min(BOARD_MAX_ZOOM, currentZoom * zoomFactor))

    if (Math.abs(nextZoom - currentZoom) < 0.0001) return

    const worldX = (pointerX - currentPan.x) / currentZoom
    const worldY = (pointerY - currentPan.y) / currentZoom
    const nextPan = {
      x: pointerX - worldX * nextZoom,
      y: pointerY - worldY * nextZoom,
    }

    setZoom(nextZoom)
    setPan(nextPan)
  }

  const beginNodeDrag = (event: ReactPointerEvent<HTMLDivElement>, id: NodeId) => {
    if (event.button !== 0) return
    const node = nodesRef.current.find(entry => entry.id === id)
    if (!node) return
    event.preventDefault()
    event.stopPropagation()
    nodeDragRef.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
      moved: false,
    }

    const applyDrag = (clientX: number, clientY: number) => {
      const gesture = nodeDragRef.current
      const board = boardRef.current
      if (!gesture || !board) return
      const rect = board.getBoundingClientRect()
      const deltaX = clientX - gesture.startX
      const deltaY = clientY - gesture.startY
      gesture.moved = gesture.moved || Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3
      const zoomScale = Math.max(BOARD_MIN_ZOOM, zoomRef.current)
      const nextX = clamp01((gesture.originX + (deltaX / (rect.width * zoomScale)) * 100) / 100) * 100
      const nextY = clamp01((gesture.originY + (deltaY / (rect.height * zoomScale)) * 100) / 100) * 100
      nodeClickBlockRef.current = true
      setNodes(prev => prev.map(entry => entry.id === gesture.id ? { ...entry, x: nextX, y: nextY } : entry))
    }

    const endDrag = () => {
      const moved = nodeDragRef.current?.moved ?? false
      nodeDragRef.current = null
      const dragTarget = window as unknown as EventTarget
      if (nodeDragListenersRef.current.move) dragTarget.removeEventListener('pointermove', nodeDragListenersRef.current.move as EventListener)
      if (nodeDragListenersRef.current.up) dragTarget.removeEventListener('pointerup', nodeDragListenersRef.current.up as EventListener)
      if (nodeDragListenersRef.current.up) dragTarget.removeEventListener('pointercancel', nodeDragListenersRef.current.up as EventListener)
      nodeDragListenersRef.current = {}
      window.setTimeout(() => { nodeClickBlockRef.current = moved }, 0)
    }

    const moveHandler = ((moveEvent: Event) => {
      const pointerEvent = moveEvent as PointerEvent
      applyDrag(pointerEvent.clientX, pointerEvent.clientY)
    }) as EventListener

    const upHandler = (() => {
      endDrag()
    }) as EventListener

    nodeDragListenersRef.current = { move: moveHandler, up: upHandler }
    const dragTarget = window as unknown as EventTarget
    dragTarget.addEventListener('pointermove', moveHandler)
    dragTarget.addEventListener('pointerup', upHandler)
    dragTarget.addEventListener('pointercancel', upHandler)
  }

  const beginModuleDrag = (event: ReactPointerEvent<HTMLDivElement>, id: number) => {
  if (event.button !== 0) return
    const module = modulesRef.current.find(entry => entry.id === id)
    if (!module) return
    event.preventDefault()
    event.stopPropagation()
    moduleDragRef.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      originX: module.x,
      originY: module.y,
      moved: false,
    }
    const applyDrag = (clientX: number, clientY: number) => {
      const gesture = moduleDragRef.current
      const board = boardRef.current
      if (!gesture || !board) return
      const rect = board.getBoundingClientRect()
      const deltaX = clientX - gesture.startX
      const deltaY = clientY - gesture.startY
      gesture.moved = gesture.moved || Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3
      const zoomScale = Math.max(BOARD_MIN_ZOOM, zoomRef.current)
      const nextX = clamp01((gesture.originX + (deltaX / (rect.width * zoomScale)) * 100) / 100) * 100
      const nextY = clamp01((gesture.originY + (deltaY / (rect.height * zoomScale)) * 100) / 100) * 100
      moduleClickBlockRef.current = true
      setModules(prev => prev.map(entry => entry.id === gesture.id ? { ...entry, x: nextX, y: nextY } : entry))
    }

    const endDrag = () => {
      const moved = moduleDragRef.current?.moved ?? false
      moduleDragRef.current = null
      const dragTarget = window as unknown as EventTarget
      if (moduleDragListenersRef.current.move) dragTarget.removeEventListener('pointermove', moduleDragListenersRef.current.move as EventListener)
      if (moduleDragListenersRef.current.up) dragTarget.removeEventListener('pointerup', moduleDragListenersRef.current.up as EventListener)
      if (moduleDragListenersRef.current.up) dragTarget.removeEventListener('pointercancel', moduleDragListenersRef.current.up as EventListener)
      moduleDragListenersRef.current = {}
      window.setTimeout(() => { moduleClickBlockRef.current = moved }, 0)
    }

    const moveHandler = ((moveEvent: Event) => {
      const pointerEvent = moveEvent as PointerEvent
      applyDrag(pointerEvent.clientX, pointerEvent.clientY)
    }) as EventListener

    const upHandler = (() => {
      endDrag()
    }) as EventListener

    moduleDragListenersRef.current = { move: moveHandler, up: upHandler }
    const dragTarget = window as unknown as EventTarget
    dragTarget.addEventListener('pointermove', moveHandler)
    dragTarget.addEventListener('pointerup', upHandler)
    dragTarget.addEventListener('pointercancel', upHandler)
  }

  useEffect(() => {
    const tick = window.setInterval(() => {
      const chaosValue = chaosRef.current
      const entropyValue = entropyRef.current
      const audioValue = audioLevelRef.current
      const bands = audioBandsRef.current

      setNodes(prev => prev.map(node => {
        const bassBias = node.id === 'sig' || node.id === 'src' || node.id === 'ion' ? bands.bass * 0.18 : 0
        const midBias = node.id === 'cbe' || node.id === 'elx' || node.id === 'flow' ? bands.mid * 0.18 : 0
        const trebleBias = node.id === 'img' || node.id === 'oan' || node.id === 'gov' ? bands.treble * 0.16 : 0
        const centerDistance = Math.hypot(node.x - 50, node.y - 50)
        const centerBias = clamp01(1 - centerDistance / 58)
        const priorityBoost = IMPORTANT_NODE_IDS.has(node.id) ? 0.12 : 0
        const drift = (Math.random() - 0.5) * 0.12 + chaosValue * 0.08 + audioValue * 0.08 + bassBias + midBias + trebleBias
        const nextActivity = clamp01(node.activity * 0.74 + drift + entropyValue * 0.08 + bands.pulse * 0.08 + centerBias * 0.08 + priorityBoost * bands.pulse)
        const nextMetrics: [string, string, string] = [
          `${Math.max(0, Math.round(90 + nextActivity * 120 + audioValue * 50))}`,
          `${Math.max(0, Math.round(32 + nextActivity * 56 + chaosValue * 24))}`,
          `${Math.round((nextActivity * 100) % 100)}%`,
        ]
        return {
          ...node,
          activity: nextActivity,
          metrics: [
            `${node.metrics[0].split(' ')[0]} ${nextMetrics[0]}`,
            `${node.metrics[1].split(' ')[0]} ${nextMetrics[1]}`,
            `${node.metrics[2].split(' ')[0]} ${nextMetrics[2]}`,
          ] as [string, string, string],
        }
      }))

      if (!orchestrationConnectedRef.current) {
        setTasks(prev => {
          let nextTasks = prev.map(task => {
            if (task.status !== 'running') return task
            const progress = Math.min(100, task.progress + 8 + chaosValue * 10 + audioValue * 12)
            return { ...task, progress, status: progress >= 100 ? ('done' as const) : ('running' as const) }
          })

          const finished = nextTasks.filter(task => task.status === 'done')
          if (finished.length > 0) {
            setArchive(current => [...finished.map(task => ({ ...task, status: 'done' as const })), ...current].slice(0, 14))
            finished.slice(0, 5).forEach(task => {
              triggerTaskCompleteFx(resolveTaskNodeId(task))
            })
            setLogs(current => [
              {
                id: nextLogId.current++,
                ts: formatTime(Date.now()),
                source: 'TASK',
                message: `${finished.length} task${finished.length > 1 ? 's' : ''} completed and archived`,
                kind: 'ok' as const,
              },
              ...current,
            ].slice(0, 28))
          }

          nextTasks = nextTasks.filter(task => task.status !== 'done')

          const spawnChance = 0.18 + chaosValue * 0.16 + audioValue * 0.08 + bands.beat * 0.24
          if (Math.random() < spawnChance) {
            const template = TASK_TEMPLATES[Math.floor(Math.random() * TASK_TEMPLATES.length)]
            const spawned: TaskItem = {
              id: nextTaskId.current++,
              name: template.name,
              path: template.path.join(' > '),
              status: Math.random() > 0.25 ? 'running' : 'queued',
              depth: template.depth,
              progress: Math.round(Math.random() * 22),
              source: template.source,
              createdAt: Date.now(),
            }
            nextTasks = [spawned, ...nextTasks].slice(0, 10)
            tasksThisMinute.current += 1
            triggerTaskSpawnFx(resolveTaskNodeId(spawned))
            setLogs(current => [
              {
                id: nextLogId.current++,
                ts: formatTime(Date.now()),
                source: spawned.source,
                message: `${spawned.name} enqueued at ${spawned.path}`,
                kind: 'warn' as const,
              },
              ...current,
            ].slice(0, 28))
          }

          return nextTasks
        })
      }

      setModules(prev => {
        const nowTs = Date.now()
        const taskLoad = clamp01(tasksRef.current.length / 10)
        const archiveLoad = clamp01(archiveRef.current.length / 14)
        const logLoad = clamp01(logsRef.current.length / 28)
        const liveLoad = clamp01(taskLoad * 0.5 + archiveLoad * 0.2 + logLoad * 0.3)
        const processingLoad = clamp01(taskLoad * 0.55 + logLoad * 0.2 + clamp01(tasksThisMinute.current / 18) * 0.25)
        const maxModules = 12
        const targetModules = Math.max(2, Math.min(maxModules, Math.round(2 + processingLoad * 9 + liveLoad * 2 + (orchestrationConnectedRef.current ? 1 : 0))))

        let next = prev
          .map(module => {
            const sourceNode = nodesRef.current.find(node => node.id === module.sourceId)
            const targetNode = nodesRef.current.find(node => node.id === module.targetId)
            const anchorX = sourceNode && targetNode ? (sourceNode.x + targetNode.x) / 2 : module.x
            const anchorY = sourceNode && targetNode ? (sourceNode.y + targetNode.y) / 2 : module.y
            const isDragging = moduleDragRef.current?.id === module.id
            const spring = isDragging ? 0 : 0.045 + bands.pulse * 0.035 + liveLoad * 0.06
            const driftX = (Math.random() - 0.5) * (0.25 + bands.treble * 0.25 + liveLoad * 0.45)
            const driftY = (Math.random() - 0.5) * (0.25 + bands.mid * 0.25 + liveLoad * 0.45)
            const closePressure = prev.length > targetModules ? (prev.length - targetModules) * 70 : 0
            const decayPerTick = module.kind === 'proxy'
              ? (760 + chaosValue * 160 + bands.pulse * 160 + liveLoad * 220 + closePressure)
              : (300 + chaosValue * 90 + bands.pulse * 110 + liveLoad * 160 + closePressure)
            return {
              ...module,
              x: clamp01(module.x / 100 + (anchorX - module.x) * spring / 100 + driftX / 100) * 100,
              y: clamp01(module.y / 100 + (anchorY - module.y) * spring / 100 + driftY / 100) * 100,
              ttl: module.ttl - decayPerTick,
            }
          })
          .map(module => ({ ...module, retiring: module.ttl < (module.kind === 'proxy' ? 900 : 2200) }))

        if (next.length > targetModules) {
          const overshoot = next.length - targetModules
          const closeIds = new Set(
            [...next]
              .sort((a, b) => a.ttl - b.ttl)
              .slice(0, overshoot)
              .map(module => module.id),
          )
          next = next.map(module => closeIds.has(module.id)
            ? { ...module, ttl: Math.min(module.ttl, 920), retiring: true }
            : module)
        }

        const beforeFilterCount = next.length
        next = next.filter(module => module.ttl > 0)
        let closedCount = beforeFilterCount - next.length

        let openedCount = 0

        const spawnModule = (
          ttlMin: number,
          ttlRange: number,
          options?: {
            label?: string
            detail?: string
            expanded?: boolean
            sourceId?: NodeId
            targetId?: NodeId
            kind?: 'baseline' | 'proxy'
          },
        ) => {
          const sourceId = options?.sourceId ?? NODE_DEFS[Math.floor(Math.random() * NODE_DEFS.length)].id
          const targetId = options?.targetId ?? resolveTargetNodeId(sourceId)
          const source = NODE_DEFS.find(node => node.id === sourceId) ?? NODE_DEFS[0]
          const target = NODE_DEFS.find(node => node.id === targetId) ?? NODE_DEFS[0]
          const label = options?.label ?? ['proxy', 'bridge', 'relay', 'pulse', 'thread', 'mirror'][Math.floor(Math.random() * 6)]
          const detail = options?.detail ?? 'orchestration micro-task'
          const maxTtl = ttlMin + Math.random() * ttlRange
          const midpointX = (source.x + target.x) / 2
          const midpointY = (source.y + target.y) / 2
          const jitterX = (Math.random() - 0.5) * 12
          const jitterY = (Math.random() - 0.5) * 10
          next.unshift({
            id: nextModuleId.current++,
            label,
            detail,
            kind: options?.kind ?? 'baseline',
            sourceId,
            targetId,
            x: clamp01((midpointX + jitterX) / 100) * 100,
            y: clamp01((midpointY + jitterY) / 100) * 100,
            ttl: maxTtl,
            maxTtl,
            createdAt: nowTs,
            retiring: false,
            expanded: options?.expanded ?? false,
          })
          openedCount += 1
          return { source, target }
        }

        const eventBurstCap = orchestrationConnectedRef.current ? 3 : 1
        const queue = proxyEventQueueRef.current
        const availableSlots = Math.max(0, maxModules - next.length)
        const spawnFromQueue = Math.min(eventBurstCap, availableSlots, queue.length)
        for (let i = 0; i < spawnFromQueue; i += 1) {
          const event = queue.shift()
          if (!event) break
          spawnModule(event.ttlMin, event.ttlRange, {
            label: event.label,
            detail: event.detail,
            sourceId: event.sourceId,
            targetId: event.targetId,
            kind: 'proxy',
          })
        }

        // Safety seed: keep at least one live module visible so the board never looks stalled.
        if (next.length === 0) {
          spawnModule(7600, 6200, {
            label: 'bootstrap-relay',
            detail: 'orchestration baseline module',
            kind: 'baseline',
          })
        }

        const deficit = Math.max(0, targetModules - next.length)
        for (let i = 0; i < deficit; i += 1) {
          const spawnChance = 0.34 + processingLoad * 0.42 + (orchestrationConnectedRef.current ? 0.12 : 0)
          if (Math.random() > spawnChance) continue
          spawnModule(8200, 7600)
        }

        if (next.length < maxModules && Math.random() < 0.04 + chaosValue * 0.06 + bands.pulse * 0.08 + processingLoad * 0.12) {
          spawnModule(9000, 8000)
        }

        if (!orchestrationConnectedRef.current && bands.beat > 0.72 && nowTs - lastBeatRef.current > 240) {
          lastBeatRef.current = nowTs
          const { source, target } = spawnModule(2600, 1400, {
            label: 'beat-proxy',
            detail: 'audio impulse relay',
            expanded: true,
            kind: 'proxy',
          })
          setLogs(current => [
            {
              id: nextLogId.current++,
              ts: formatTime(nowTs),
              source: 'AUDIO',
              message: `beat impulse routed through ${source.tag} → ${target.tag}`,
              kind: 'ok' as const,
            },
            ...current,
          ].slice(0, 28))
        }

        const forceOpenCadenceMs = Math.max(1400, 2800 - processingLoad * 900 - bands.pulse * 600)
        if (next.length < maxModules && nowTs - lastModuleOpenAtRef.current >= forceOpenCadenceMs) {
          spawnModule(7600, 7800)
        }

        const forceCloseCadenceMs = Math.max(2200, 4200 - liveLoad * 800 - chaosValue * 550)
        if (openedCount === 0 && next.length > 2 && nowTs - lastModuleCloseAtRef.current >= forceCloseCadenceMs) {
          const draggingModuleId = moduleDragRef.current?.id
          const minAgeMs = 3200
          const closeCandidate = [...next]
            .sort((a, b) => a.ttl - b.ttl)
            .find(module => module.id !== draggingModuleId && nowTs - module.createdAt >= minAgeMs)
          if (closeCandidate) {
            next = next.filter(module => module.id !== closeCandidate.id)
            closedCount += 1
          }
        }

        if (openedCount > 0) {
          lastModuleOpenAtRef.current = nowTs
        }

        if (closedCount > 0) {
          lastModuleCloseAtRef.current = nowTs
        }

        if (openedCount > 0 && Math.random() < 0.7) {
          setLogs(current => [
            {
              id: nextLogId.current++,
              ts: formatTime(nowTs),
              source: 'ORCH',
              message: `${openedCount} module${openedCount > 1 ? 's' : ''} opened in orchestration cycle`,
              kind: 'ok' as const,
            },
            ...current,
          ].slice(0, 28))
        }

        if (closedCount > 0 && Math.random() < 0.7) {
          setLogs(current => [
            {
              id: nextLogId.current++,
              ts: formatTime(nowTs),
              source: 'ORCH',
              message: `${closedCount} module${closedCount > 1 ? 's' : ''} closed in orchestration cycle`,
              kind: 'warn' as const,
            },
            ...current,
          ].slice(0, 28))
        }

        return next.slice(0, maxModules)
      })

      if (!orchestrationConnectedRef.current && Math.random() < 0.18 + chaosValue * 0.12) {
        const entry: LogItem = {
          id: nextLogId.current++,
          ts: formatTime(Date.now()),
          source: ['SYS', 'OAN', 'SRC', 'CBE', 'ELX', 'ION'][Math.floor(Math.random() * 6)],
          message: [
            'coherence stabilized',
            'bridge handoff completed',
            'lattice write acknowledged',
            'autonomous node fired',
            'signal routed',
            'entropy balanced',
          ][Math.floor(Math.random() * 6)],
          kind: Math.random() > 0.86 ? ('err' as const) : Math.random() > 0.55 ? ('warn' as const) : ('ok' as const),
        }
        setLogs(current => [entry, ...current].slice(0, 28))
      }
    }, 1200)

    const reset = window.setInterval(() => {
      tasksThisMinute.current = 0
    }, 60000)

    const seriesTick = window.setInterval(() => {
      const chaosValue = chaosRef.current
      const entropyValue = entropyRef.current
      const audioValue = audioLevelRef.current
      const bands = audioBandsRef.current
      setNodeSeries(prev => {
        const nextSeries: NodeSeries = { ...prev }
        NODE_DEFS.forEach(node => {
          const current = nextSeries[node.id] ?? []
          const nodeBand = node.id === 'sig' || node.id === 'src' || node.id === 'ion'
            ? bands.bass
            : node.id === 'cbe' || node.id === 'elx' || node.id === 'flow'
              ? bands.mid
              : bands.treble
          const beatEnergy = audioBandsRef.current.beat
          const pulseEnergy = audioBandsRef.current.pulse
          const nextPoint = clamp01(
            0.22 + chaosValue * 0.44 + audioValue * 0.18 + entropyValue * 0.14 +
            nodeBand * 0.28 + beatEnergy * 0.16 + pulseEnergy * 0.12 + Math.random() * 0.22
          ) * 100
          nextSeries[node.id] = [...current.slice(-27), nextPoint]
        })
        return nextSeries
      })
    }, 300)

    return () => {
      window.clearInterval(tick)
      window.clearInterval(reset)
      window.clearInterval(seriesTick)
    }
  }, [chaos, entropy, triggerTaskCompleteFx, triggerTaskSpawnFx])

  const boardMetrics = useMemo(() => {
    const activeTasks = tasks.length
    const activeModules = modules.length
    const runningNodes = nodes.filter(node => node.activity > 0.55).length
    const sharedAudioLevel = masterMuted ? 0 : clamp01(Math.max(masterPeak, (masterVuL + masterVuR) / 2))
    const effectiveAudioLevel = Math.max(audioLevel, sharedAudioLevel)
    const signalsPerSec = Math.max(0, Math.round(10 + chaos * 20 + effectiveAudioLevel * 18 + audioBands.bass * 12 + activeModules * 2))
    const coherence = Math.max(25, Math.min(100, Math.round(100 - chaos * 30 + entropy * 8 - activeModules * 2 + effectiveAudioLevel * 4 + audioBands.mid * 4)))
    const tasksPerMin = Math.max(tasksThisMinute.current, activeTasks * 2)
    const uptime = Math.max(0, Math.floor((now - PERFORMANCE_START) / 1000))
    const uptimeText = [
      String(Math.floor(uptime / 3600)).padStart(2, '0'),
      String(Math.floor((uptime % 3600) / 60)).padStart(2, '0'),
      String(uptime % 60).padStart(2, '0'),
    ].join(':')

    return {
      signalsPerSec,
      activeBridges: activeTasks + activeModules,
      latticeNodes: nodes.length + activeModules + runningNodes,
      tasksPerMin,
      coherence,
      uptimeText,
    }
  }, [audioBands.bass, audioBands.mid, audioLevel, chaos, entropy, masterMuted, masterPeak, masterVuL, masterVuR, modules.length, nodes, now, tasks.length])

  const taskPressure = clamp01(tasks.length / 10)
  const archivePressure = clamp01(archive.length / 14)
  const logPressure = clamp01(logs.length / 28)
  const livePressure = clamp01(taskPressure * 0.5 + archivePressure * 0.2 + logPressure * 0.3 + (orchestrationConnected ? 0.12 : 0))
  const sharedAudioLevel = masterMuted ? 0 : clamp01(Math.max(masterPeak, (masterVuL + masterVuR) / 2))
  const effectiveAudioLevel = clamp01(Math.max(audioLevel, sharedAudioLevel))
  const effectiveBass = clamp01(Math.max(audioBands.bass, sharedAudioLevel * 0.88))
  const effectiveMid = clamp01(Math.max(audioBands.mid, sharedAudioLevel * 0.72))
  const effectiveTreble = clamp01(Math.max(audioBands.treble, sharedAudioLevel * 0.62))
  const effectiveAudioPulse = clamp01(Math.max(audioBands.pulse, sharedAudioLevel * 0.9))
  const effectiveAudioBeat = clamp01(Math.max(audioBands.beat, sharedAudioLevel * 0.78))
  const audioGlow = clamp01(effectiveAudioPulse * 0.68 + effectiveAudioBeat * 0.46)
  const backendGlow = clamp01(livePressure * 0.88 + taskPressure * 0.22 + logPressure * 0.14)
  const localAudioReactiveConnected = audioStatus !== 'AUDIO OFF' && audioStatus !== 'REQUESTING...'
  const audioReactiveConnected = localAudioReactiveConnected || sharedAudioLevel > 0.02
  const sequencerEnergy = clamp01(effectiveAudioBeat * 0.72 + effectiveAudioPulse * 0.6 + effectiveAudioLevel * 0.22)
  const sequencerBpm = Math.round(72 + sequencerEnergy * 92)
  const beatDurationMs = 60000 / Math.max(1, sequencerBpm)
  const beatStepDurationMs = 60000 / Math.max(1, sequencerBpm * 2)
  const realtimeNow = Date.now()
  const backendReactiveConnected = orchestrationConnected || livePressure > 0.08
  const backendCadenceMs = Math.max(420, 1900 - boardMetrics.tasksPerMin * 18)
  const backendSequenceStep = Math.floor(realtimeNow / backendCadenceMs)
  const backendCycle = (realtimeNow % backendCadenceMs) / backendCadenceMs
  const backendPulse = backendReactiveConnected ? clamp01(Math.sin(backendCycle * Math.PI * 2) * 0.5 + 0.5) : 0
  const musicBeatPhase = audioReactiveConnected ? (realtimeNow % beatDurationMs) / beatDurationMs : 0
  const musicTempoPhase = audioReactiveConnected ? (realtimeNow % beatStepDurationMs) / beatStepDurationMs : 0
  const musicTempoLock = clamp01(audioReactiveConnected ? (0.35 + effectiveAudioBeat * 0.45 + effectiveAudioPulse * 0.22) : 0)
  const musicBassDrop = clamp01(Math.max(0, effectiveBass * 1.28 + effectiveAudioPulse * 0.28 + audioGlow * 0.18 - 0.24))
  const musicNoteAccent = clamp01(Math.max(effectiveTreble * 0.92 + effectiveAudioPulse * 0.28 + (1 - musicBeatPhase) * 0.18))
  const musicVelocity = clamp01(Math.max(effectiveAudioLevel * 0.68 + effectiveAudioPulse * 0.58 + musicBassDrop * 0.2))
  const musicReactiveDrive = clamp01(musicTempoLock * 0.38 + musicBassDrop * 0.34 + musicNoteAccent * 0.22 + musicVelocity * 0.18)
  const centerSparkEnergy = clamp01(
    effectiveAudioBeat * 0.72 +
    effectiveAudioPulse * 0.48 +
    effectiveTreble * 0.42 +
    effectiveAudioLevel * 0.22 +
    livePressure * 0.16 +
    musicBassDrop * 0.24 +
    musicNoteAccent * 0.18
  )
  const centerSparkWindowMs = Math.max(96, Math.round(beatStepDurationMs * (0.58 - centerSparkEnergy * 0.16)))
  const centerSparkStep = Math.floor(realtimeNow / centerSparkWindowMs)
  const centerSparkCount = Math.round(14 + centerSparkEnergy * 26 + musicBassDrop * 4 + (audioReactiveConnected ? 4 : 0))

  const centerSparks = useMemo(() => {
    return Array.from({ length: centerSparkCount }, (_, index) => {
      const baseSeed = centerSparkStep * 23.11 + index * 31.73 + sequencerEnergy * 17.9
      const angle = hashNoise(baseSeed + 4.2) * Math.PI * 2
      const lifeOffset = hashNoise(baseSeed + 6.4)
      const progress = clamp01((realtimeNow % centerSparkWindowMs) / centerSparkWindowMs)
      const life = clamp01(1 - ((progress + lifeOffset * (0.72 + musicBassDrop * 0.24)) % 1))
      const jitter = hashNoise(baseSeed + 9.8)
      const velocity = 0.58 + hashNoise(baseSeed + 2.3) * (0.82 + musicVelocity * 0.48)
      const reach = 26 + hashNoise(baseSeed + 11.1) * (76 + centerSparkEnergy * 180 + musicBassDrop * 48)
      const travel = (1 - life) * velocity
      const x = Math.cos(angle) * reach * travel
      const y = Math.sin(angle) * reach * travel
      const length = 4 + (1 - life) * (10 + centerSparkEnergy * 24 + musicNoteAccent * 10)
      const width = 1 + jitter * (1.5 + centerSparkEnergy * 1.5 + musicVelocity * 0.6)
      const glow = 4 + centerSparkEnergy * 18 + musicBassDrop * 10 + jitter * 8
      const opacity = clamp01((Math.pow(life, 0.42) * (0.35 + centerSparkEnergy * 0.76) + effectiveAudioBeat * 0.18 + musicNoteAccent * 0.14) * (0.72 + jitter * 0.45))
      const mix = hashNoise(baseSeed + 14.7)
      const r = Math.round(0 * (1 - mix) + 123 * mix)
      const g = Math.round(245 * (1 - mix) + 255 * mix)
      const b = Math.round(255 * (1 - mix) + 64 * mix)

      return {
        id: `${centerSparkStep}-${index}`,
        x,
        y,
        angleDeg: (angle * 180) / Math.PI,
        length,
        width,
        glow,
        opacity,
        color: `${r}, ${g}, ${b}`,
      }
    })
  }, [centerSparkCount, centerSparkEnergy, centerSparkStep, centerSparkWindowMs, effectiveAudioBeat, musicBassDrop, musicNoteAccent, musicVelocity, realtimeNow, sequencerEnergy])

  const centerSparkCoreOpacity = clamp01(0.2 + centerSparkEnergy * 0.56)
  const centerSparkHaloOpacity = clamp01(0.08 + centerSparkEnergy * 0.24 + musicBassDrop * 0.12)

  const wireRippleLookup = useMemo(() => {
    const map = new Map<string, number>()
    wireRipples.forEach(effect => {
      const strength = clamp01(effect.ttl / effect.maxTtl)
      map.set(effect.edgeId, Math.max(map.get(effect.edgeId) ?? 0, strength))
    })
    return map
  }, [wireRipples])

  const nodeFlashLookup = useMemo(() => {
    const map = new Map<NodeId, { strength: number; color: string }>()
    nodeFlashes.forEach(effect => {
      const strength = clamp01(effect.ttl / effect.maxTtl)
      const current = map.get(effect.nodeId)
      if (!current || strength > current.strength) {
        map.set(effect.nodeId, { strength, color: effect.color })
      }
    })
    return map
  }, [nodeFlashes])

  const recentProxyModules = useMemo(() => {
    const nowTs = Date.now()
    const ttlWindow = 2400
    const recentEvents = [...tasks, ...archive.slice(0, 2)]
      .filter(task => nowTs - task.createdAt < ttlWindow)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 4)

    return recentEvents.map((task, index) => {
      const sourceId = resolveTaskNodeId(task)
      const targetId = resolveTargetNodeId(sourceId)
      const source = NODE_DEFS.find(node => node.id === sourceId) ?? NODE_DEFS[0]
      const target = NODE_DEFS.find(node => node.id === targetId) ?? NODE_DEFS[0]
      const age = nowTs - task.createdAt
      const ttl = Math.max(0, ttlWindow - age)
      const jitterSeed = hashNoise(task.id * 17.23 + index * 9.1)
      const jitterX = (jitterSeed - 0.5) * 14
      const jitterY = (hashNoise(task.id * 29.7 + index * 5.6) - 0.5) * 12

      return {
        id: -100000 - task.id * 10 - index,
        label: `${task.status}-proxy`,
        detail: `${compactText(task.name, 28)} · ${task.status}`,
        kind: 'proxy' as const,
        sourceId,
        targetId,
        x: clamp01(((source.x + target.x) / 2 + jitterX) / 100) * 100,
        y: clamp01(((source.y + target.y) / 2 + jitterY) / 100) * 100,
        ttl,
        maxTtl: ttlWindow,
        createdAt: task.createdAt,
        retiring: ttl < 900,
        expanded: false,
      } satisfies ModuleItem
    })
  }, [archive, tasks, now])

  const renderedModules = useMemo(() => {
    return [...modules, ...recentProxyModules].slice(0, 14)
  }, [modules, recentProxyModules])

  const boardEdges = useMemo(() => {
    const lookup = new Map(nodes.map(node => [node.id, node]))
    return EDGE_DEFS.map(edge => {
      const from = lookup.get(edge.from)
      const to = lookup.get(edge.to)
      if (!from || !to) return null
      return { ...edge, from, to }
    }).filter(Boolean) as Array<{ from: BoardNode; to: BoardNode; label: string; color: string }>
  }, [nodes])

  const boardLayout = useMemo(() => {
    return {
      outer: 'grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start',
      boardHeight: 'min-h-[720px] xl:h-[calc(100vh-13.5rem)]',
      sideHeight: 'xl:h-[calc(100vh-13.5rem)]',
    }
  }, [])

  const stopAudio = useCallback(() => {
    const current = audioRef.current
    if (current.raf) window.cancelAnimationFrame(current.raf)
    current.stream?.getTracks().forEach(track => track.stop())
    current.source?.disconnect()
    current.analyser?.disconnect()
    current.context?.close().catch(() => undefined)
    audioRef.current = {}
    setAudioLevel(0)
    setAudioStatus('AUDIO OFF')
  }, [])

  const startAudio = useCallback(async () => {
    if (audioRef.current.stream) {
      stopAudio()
      return
    }

    setAudioStatus('REQUESTING...')

    try {
      let stream: MediaStream | null = null
      let mode = 'SYSTEM'

      if (navigator.mediaDevices?.getDisplayMedia) {
        try {
          const displayMediaConstraints: MediaStreamConstraints & {
            preferCurrentTab?: boolean
            selfBrowserSurface?: 'include' | 'exclude'
            surfaceSwitching?: 'include' | 'exclude'
            systemAudio?: 'include' | 'exclude'
            monitorTypeSurfaces?: 'include' | 'exclude'
          } = {
            video: true,
            audio: true,
            preferCurrentTab: true,
            selfBrowserSurface: 'include',
            surfaceSwitching: 'include',
            systemAudio: 'include',
            monitorTypeSurfaces: 'include',
          }

          stream = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints)
          if (!stream.getAudioTracks().length) {
            stream.getTracks().forEach(track => track.stop())
            stream = null
          }
        } catch {
          stream = null
        }
      }

      if (!stream && navigator.mediaDevices?.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        mode = 'MIC'
      }

      if (!stream) throw new Error('No audio stream available')

      const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtor) throw new Error('Web Audio unsupported')

      const context = new AudioCtor()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.82
      source.connect(analyser)

      const freq = new Uint8Array(analyser.frequencyBinCount)
      const loop = () => {
        analyser.getByteFrequencyData(freq)
        const energy = freq.reduce((sum, value) => sum + value, 0) / (freq.length * 255)
        const bandSlice = (start: number, end: number) => {
          const slice = freq.slice(start, end)
          return slice.length ? slice.reduce((sum, value) => sum + value, 0) / (slice.length * 255) : 0
        }
        const bass = bandSlice(0, Math.max(1, Math.floor(freq.length * 0.12)))
        const mid = bandSlice(Math.floor(freq.length * 0.12), Math.max(2, Math.floor(freq.length * 0.5)))
        const treble = bandSlice(Math.floor(freq.length * 0.5), freq.length)
        const pulse = clamp01(energy * 0.55 + bass * 0.45)
        const beat = clamp01(Math.max(0, bass * 1.25 - audioBandsRef.current.bass * 0.45 + energy * 0.22))
        setAudioLevel(clamp01(energy))
        setAudioBands({ bass, mid, treble, pulse, beat })
        audioRef.current.raf = window.requestAnimationFrame(loop)
      }

      audioRef.current = { context, analyser, source, stream }
      setAudioStatus(`${mode} LIVE`)
      loop()
    } catch {
      setAudioStatus('AUDIO OFF')
      stopAudio()
    }
  }, [stopAudio])

  useEffect(() => stopAudio, [stopAudio])

  const toggleNodeExpanded = (id: NodeId) => {
    setNodes(prev => prev.map(node => node.id === id ? { ...node, expanded: !node.expanded } : node))
  }

  const toggleModuleExpanded = (id: number) => {
    if (moduleClickBlockRef.current) return
    setModules(prev => prev.map(module => module.id === id ? { ...module, expanded: !module.expanded } : module))
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        <div className="min-w-0">
          <div className="text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color }}>ORCHESTRATION</div>
          <div className="text-[9px] text-[var(--muted)]">Native orchestration board, task stream, audio reactivity, and shared chaos control.</div>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
          <Link className="text-[var(--accent)] hover:underline" to="/chaos">Open Chaos Governor</Link>
          <Link className="text-[var(--accent)] hover:underline" to="/audio">Open Audio Engine</Link>
        </div>
      </div>

      <div className="grid gap-2 rounded-md border border-[var(--border)] bg-[rgba(2,12,22,0.96)] px-3 py-2 text-[8px] uppercase tracking-[0.14em] text-[var(--muted)] sm:grid-cols-2 xl:grid-cols-6">
        {[
          ['Signals/sec', String(boardMetrics.signalsPerSec)],
          ['Active Bridges', String(boardMetrics.activeBridges)],
          ['Lattice Nodes', String(boardMetrics.latticeNodes)],
          ['Tasks/min', String(boardMetrics.tasksPerMin)],
          ['Coherence', `${boardMetrics.coherence}%`],
          ['Uptime', boardMetrics.uptimeText],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded border border-white/5 bg-white/2 px-2 py-1">
            <span>{label}</span>
            <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>

      <div className={boardLayout.outer}>
        <Panel title="Orchestration Board" accent={color} className={boardLayout.boardHeight} noPad>
          <div
            ref={boardRef}
            className="relative h-full min-h-[760px] overflow-hidden cursor-grab active:cursor-grabbing"
            onPointerDown={beginBoardPan}
            onPointerMove={moveBoardPan}
            onPointerUp={endBoardPan}
            onPointerLeave={endBoardPan}
            onWheel={handleBoardWheel}
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 20%, rgba(0,245,255,0.10), transparent 28%), radial-gradient(circle at 80% 0%, rgba(123,97,255,0.08), transparent 20%), linear-gradient(rgba(0,245,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.05) 1px, transparent 1px)',
              backgroundSize: 'auto, auto, 28px 28px, 28px 28px',
              backgroundColor: `rgba(2,12,22,${0.88 - effectiveAudioLevel * 0.1 - musicVelocity * 0.04})`,
              boxShadow: `inset 0 0 ${18 + effectiveAudioLevel * 58 + musicBassDrop * 34}px rgba(0,245,255,${0.04 + effectiveAudioLevel * 0.14 + musicReactiveDrive * 0.1})`,
            }}
          >
            <div className="pointer-events-none absolute inset-0 border border-white/5" />
            <div className="pointer-events-none absolute inset-0" style={{ opacity: 0.36 + effectiveAudioLevel * 0.36 + musicTempoLock * 0.18, backgroundImage: 'linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
            <div className="pointer-events-none absolute left-4 top-4 text-[8px] uppercase tracking-[0.24em] text-[var(--muted)]">Blueprint grid // drag to pan, scroll to zoom</div>
            <div className="pointer-events-none absolute right-4 top-4 text-[8px] uppercase tracking-[0.22em] text-[var(--border2)] opacity-90">Zoom {Math.round(zoom * 100)}%</div>
            <div className="pointer-events-none absolute right-4 bottom-4 text-right text-[8px] uppercase tracking-[0.24em] text-[var(--border2)] opacity-80">Octane lattice board</div>
            <div
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{ transform: 'translate3d(-50%, -50%, 0)' }}
            >
              <div
                className="h-[320px] w-[320px] rounded-full will-change-transform"
                style={{
                  opacity: 0.24 + audioBands.pulse * 0.36 + musicBassDrop * 0.16,
                  transform: `scale(${1 + audioBands.pulse * 0.12 + musicBassDrop * 0.08})`,
                  background:
                    `radial-gradient(circle, rgba(0,245,255,${0.2 + audioBands.bass * 0.22 + musicBassDrop * 0.18}) 0%, rgba(123,97,255,${0.12 + audioBands.mid * 0.16 + musicNoteAccent * 0.08}) 36%, rgba(0,255,170,${0.08 + audioBands.treble * 0.14 + musicVelocity * 0.08}) 58%, transparent 72%)`,
                  filter: `blur(${10 + audioBands.pulse * 8 + musicBassDrop * 6}px)`,
                }}
              />
            </div>
            <div
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{ transform: 'translate3d(-50%, -50%, 0)' }}
            >
              <div
                className="h-[420px] w-[420px] rounded-full border motion-safe:animate-[spin_24s_linear_infinite] will-change-transform"
                style={{
                  borderColor: `rgba(0,245,255,${0.08 + audioBands.bass * 0.16 + musicTempoLock * 0.12})`,
                  boxShadow: `0 0 80px rgba(0,245,255,${0.06 + audioBands.bass * 0.12 + musicVelocity * 0.12})`,
                  transform: `scale(${1 + audioBands.mid * 0.09 + musicTempoLock * 0.06})`,
                  opacity: 0.32 + audioBands.mid * 0.18 + musicTempoLock * 0.12,
                }}
              />
            </div>
            <div
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{ transform: 'translate3d(-50%, -50%, 0)' }}
            >
              <div
                className="relative h-[560px] w-[560px]"
                style={{ opacity: 0.76 + centerSparkEnergy * 0.2 + musicBassDrop * 0.12 }}
              >
                <div
                  className="absolute left-1/2 top-1/2 rounded-full"
                  style={{
                    width: `${18 + centerSparkEnergy * 34}px`,
                    height: `${18 + centerSparkEnergy * 34}px`,
                    transform: 'translate(-50%, -50%)',
                    background: `radial-gradient(circle, rgba(255,255,255,${0.3 + centerSparkCoreOpacity * 0.46 + musicNoteAccent * 0.1}) 0%, rgba(0,245,255,${0.2 + centerSparkCoreOpacity * 0.5 + musicBassDrop * 0.12}) 52%, rgba(123,97,255,0) 72%)`,
                    boxShadow: `0 0 ${10 + centerSparkEnergy * 28 + musicBassDrop * 12}px rgba(0,245,255,${0.2 + centerSparkCoreOpacity * 0.48 + musicBassDrop * 0.14}), 0 0 ${8 + centerSparkEnergy * 18}px rgba(123,97,255,${0.12 + centerSparkCoreOpacity * 0.34 + musicNoteAccent * 0.12})`,
                  }}
                />
                <div
                  className="absolute left-1/2 top-1/2 rounded-full"
                  style={{
                    width: `${84 + centerSparkEnergy * 260 + musicBassDrop * 44}px`,
                    height: `${84 + centerSparkEnergy * 260 + musicBassDrop * 44}px`,
                    transform: `translate(-50%, -50%) scale(${0.72 + musicTempoPhase * 0.42 + centerSparkEnergy * 0.34 + musicBassDrop * 0.16})`,
                    opacity: centerSparkHaloOpacity,
                    background: `radial-gradient(circle, rgba(0,245,255,${0.2 + centerSparkEnergy * 0.28 + musicBassDrop * 0.14}) 0%, rgba(123,97,255,${0.12 + centerSparkEnergy * 0.22 + musicNoteAccent * 0.08}) 36%, rgba(0,255,170,0) 68%)`,
                    filter: `blur(${6 + centerSparkEnergy * 12 + musicBassDrop * 6}px)`,
                  }}
                />
                {centerSparks.map(spark => (
                  <div
                    key={spark.id}
                    className="absolute left-1/2 top-1/2"
                    style={{
                      transform: `translate(calc(-50% + ${spark.x}px), calc(-50% + ${spark.y}px)) rotate(${spark.angleDeg}deg)`,
                      opacity: spark.opacity,
                    }}
                  >
                    <div
                      className="rounded-full"
                      style={{
                        width: `${spark.length}px`,
                        height: `${spark.width}px`,
                        background: `linear-gradient(90deg, rgba(${spark.color}, 0), rgba(${spark.color}, ${0.95 + musicNoteAccent * 0.04}), rgba(255,255,255,0.94))`,
                        boxShadow: `0 0 ${spark.glow}px rgba(${spark.color},${0.8 + musicBassDrop * 0.1}), 0 0 ${spark.glow * 0.55}px rgba(255,255,255,${0.62 + musicNoteAccent * 0.1})`,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center uppercase tracking-[0.22em] text-[rgba(0,245,255,0.035)]">
              <div>
                <div className="text-[clamp(2.5rem,10vw,5rem)] font-bold leading-none">OCTANE v6</div>
                <div className="mt-2 text-[10px]">/orchestration · stellar edition · ionirix llc</div>
              </div>
            </div>
            <div className="absolute inset-0 will-change-transform" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                {boardEdges.map((edge, index) => {
                  const start = {
                    x: (edge.from.x / 100) * boardSize.width + BOARD_NODE_WIDTH / 2,
                    y: (edge.from.y / 100) * boardSize.height + BOARD_NODE_HEIGHT / 2,
                  }
                  const end = {
                    x: (edge.to.x / 100) * boardSize.width + BOARD_NODE_WIDTH / 2,
                    y: (edge.to.y / 100) * boardSize.height + BOARD_NODE_HEIGHT / 2,
                  }
                  const deltaX = end.x - start.x
                  const deltaY = end.y - start.y
                  const bend = Math.max(24, Math.min(128, Math.hypot(deltaX, deltaY) * 0.22))
                  const control1 = { x: start.x + deltaX * 0.38, y: start.y - bend }
                  const control2 = { x: end.x - deltaX * 0.38, y: end.y + bend }
                  const wireLoopMs = beatDurationMs * (6.4 - sequencerEnergy * 1.2)
                  const wirePhaseA = (now / wireLoopMs) + index * 0.11
                  const wirePhaseB = wirePhaseA + 0.37
                  const particleProgressA = 0.16 + smoothstep(wirePhaseA % 1) * 0.68
                  const particleProgressB = 0.16 + smoothstep(wirePhaseB % 1) * 0.68
                  const particleA = cubicPoint(start, control1, control2, end, particleProgressA)
                  const particleB = cubicPoint(start, control1, control2, end, particleProgressB)
                  const beatPulse = audioReactiveConnected ? clamp01(Math.sin(musicBeatPhase * Math.PI * 2) * 0.5 + 0.5) : 0
                  const tempoPulse = audioReactiveConnected ? clamp01(Math.sin(musicTempoPhase * Math.PI * 2) * 0.5 + 0.5) : 0
                  const tempoFlash = clamp01(sequencerEnergy * 0.6 + beatPulse * 0.48 + tempoPulse * 0.3 + musicBassDrop * 0.18)
                  const bassNodeWeight = (edge.from.id === 'ion' || edge.from.id === 'src' || edge.from.id === 'sig' || edge.to.id === 'ion' || edge.to.id === 'src' || edge.to.id === 'sig') ? 1 : 0.58
                  const bassLinePulse = clamp01(effectiveBass * bassNodeWeight + effectiveAudioPulse * 0.24 + musicBassDrop * 0.24)
                  const rippleStrength = wireRippleLookup.get(edgeId(edge.from.id, edge.to.id)) ?? 0
                  const edgeStrokeWidth = 1.3 + bassLinePulse * 2.3 + tempoFlash * 1.15 + rippleStrength * 3.1 + taskPressure * 0.28 + musicVelocity * 0.8
                  const edgeStrokeOpacity = 0.2 + bassLinePulse * 0.2 + tempoFlash * 0.18 + rippleStrength * 0.48 + musicNoteAccent * 0.08
                  return (
                    <g key={`${edge.from.id}-${edge.to.id}`}>
                      <path d={`M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`} stroke={rippleStrength > 0.08 ? '#34d399' : edge.color} strokeOpacity={edgeStrokeOpacity} strokeWidth={edgeStrokeWidth} fill="none" />
                      {rippleStrength > 0.06 && (
                        <path d={`M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`} stroke="#86efac" strokeOpacity={0.25 + rippleStrength * 0.65} strokeWidth={1.2 + rippleStrength * 3.8} fill="none" />
                      )}
                      <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 4} fill={edge.color} fillOpacity={0.16 + tempoFlash * 0.2 + rippleStrength * 0.24 + musicNoteAccent * 0.08} fontSize="8" textAnchor="middle">
                        {edge.label}
                      </text>
                      <circle cx={particleA.x} cy={particleA.y} r={2 + bassLinePulse * 2.1 + livePressure + tempoFlash * 1.1 + rippleStrength * 1.8 + musicBassDrop * 1.2} fill={rippleStrength > 0.06 ? '#86efac' : edge.color} fillOpacity={0.58 + livePressure * 0.16 + tempoFlash * 0.2 + rippleStrength * 0.2 + musicVelocity * 0.08} />
                      <circle cx={particleB.x} cy={particleB.y} r={1.3 + bassLinePulse * 0.9 + taskPressure * 0.28 + tempoFlash * 0.65 + rippleStrength * 1.5 + musicNoteAccent * 0.8} fill="white" fillOpacity={0.34 + logPressure * 0.12 + tempoFlash * 0.2 + rippleStrength * 0.2 + musicNoteAccent * 0.1} />
                    </g>
                  )
                })}
              </svg>

              {taskBursts.map(effect => {
                const node = nodes.find(entry => entry.id === effect.nodeId)
                if (!node) return null
                const progress = 1 - clamp01(effect.ttl / effect.maxTtl)
                const centerX = (node.x / 100) * boardSize.width + BOARD_NODE_WIDTH / 2
                const centerY = (node.y / 100) * boardSize.height + BOARD_NODE_HEIGHT / 2
                const isComplete = effect.kind === 'complete'
                const burstColor = isComplete ? '52, 211, 153' : '0, 245, 255'
                const burstTempo = clamp01(musicBassDrop * 0.7 + musicNoteAccent * 0.3)

                return (
                  <div
                    key={effect.id}
                    className="pointer-events-none absolute"
                    style={{ left: centerX, top: centerY, transform: 'translate(-50%, -50%)' }}
                  >
                    <div
                      className="absolute rounded-full border"
                      style={{
                        width: `${26 + progress * (122 + burstTempo * 30)}px`,
                        height: `${26 + progress * (122 + burstTempo * 30)}px`,
                        marginLeft: `${-(13 + progress * (61 + burstTempo * 15))}px`,
                        marginTop: `${-(13 + progress * (61 + burstTempo * 15))}px`,
                        borderColor: `rgba(${burstColor},${0.68 - progress * 0.52 + burstTempo * 0.08})`,
                        boxShadow: `0 0 ${12 + progress * (38 + burstTempo * 16)}px rgba(${burstColor},${0.32 - progress * 0.2 + musicVelocity * 0.08})`,
                        opacity: 0.88 - progress * 0.7 + burstTempo * 0.08,
                      }}
                    />
                    {Array.from({ length: 6 }).map((_, particleIndex) => {
                      const angle = (Math.PI * 2 * particleIndex) / 6 + progress * (1.4 + burstTempo * 0.6)
                      const radius = 14 + progress * ((isComplete ? 96 : 72) + musicBassDrop * 20)
                      const px = Math.cos(angle) * radius
                      const py = Math.sin(angle) * radius
                      return (
                        <div
                          key={`${effect.id}-p-${particleIndex}`}
                          className="absolute rounded-full"
                          style={{
                            width: `${3 + (isComplete ? 2 : 1)}px`,
                            height: `${3 + (isComplete ? 2 : 1)}px`,
                            marginLeft: `${px}px`,
                            marginTop: `${py}px`,
                            background: `rgba(${burstColor},${0.9 - progress * 0.7 + musicNoteAccent * 0.08})`,
                            boxShadow: `0 0 ${8 + progress * 18 + musicBassDrop * 8}px rgba(${burstColor},${0.64 - progress * 0.4 + musicVelocity * 0.08})`,
                            opacity: 0.95 - progress * 0.75 + burstTempo * 0.04,
                          }}
                        />
                      )
                    })}
                  </div>
                )
              })}

              {renderedModules.map((module, moduleIndex) => {
                const isProxyModule = module.kind === 'proxy'
                const sequenceLength = Math.max(renderedModules.length, 1)
                const beatIndex = Math.floor(realtimeNow / beatDurationMs)
                const beatCycle = (realtimeNow % beatDurationMs) / beatDurationMs
                const hopSlots = Math.max(1, Math.min(3, Math.round(1 + sequencerEnergy * 2)))
                const hopHoldMs = 1000
                const hopBeatsInHold = Math.max(1, Math.ceil(hopHoldMs / beatDurationMs))
                let hopFlash = 0
                for (let hopOffset = 0; hopOffset <= hopBeatsInHold; hopOffset += 1) {
                  const sampleBeat = beatIndex - hopOffset
                  for (let hopSlot = 0; hopSlot < hopSlots; hopSlot += 1) {
                    const slotIndex = Math.floor(hashNoise(sampleBeat * 17.23 + hopSlot * 41.17 + sequencerEnergy * 11.7) * sequenceLength)
                    if (slotIndex !== moduleIndex) continue
                    const ageMs = realtimeNow - sampleBeat * beatDurationMs
                    const decay = clamp01(1 - ageMs / hopHoldMs)
                    const slotVariance = 0.72 + hashNoise(sampleBeat * 13.11 + hopSlot * 29.7 + module.id) * 0.56
                    const layer = hopOffset === 0 ? 1 : (0.78 - Math.min(0.45, hopOffset * 0.1))
                    hopFlash = Math.max(hopFlash, decay * layer * slotVariance)
                  }
                }
                const audioPulse = audioReactiveConnected ? clamp01(Math.sin(musicBeatPhase * Math.PI * 2) * 0.5 + 0.5) : 0
                const backendSelection = hashNoise(module.id * 19 + backendSequenceStep * 23 + logs.length * 7)
                const hardAudioFlash = audioReactiveConnected && hopFlash > 0.16 ? 1 : 0
                const hardBackendFlash = backendReactiveConnected && backendPulse > (0.7 - backendGlow * 0.16) && backendSelection > 0.58 ? 1 : 0
                const audioFlashOn = hopFlash > 0.08
                const backendFlashOn = !audioReactiveConnected && hardBackendFlash > 0
                const syncFlash = audioReactiveConnected
                  ? clamp01(hopFlash * (0.92 + audioPulse * 0.22))
                  : clamp01(backendFlashOn ? (0.72 + backendGlow * 0.24) : 0)
                const backendBeat = backendReactiveConnected ? clamp01(backendPulse * (0.55 + backendGlow * 0.55) + musicTempoLock * 0.16) : 0
                const snareReactive = clamp01(Math.max(0, effectiveTreble * 1.28 + (effectiveTreble - effectiveMid) * 0.9 + effectiveAudioPulse * 0.22 + musicNoteAccent * 0.18))
                const snareGate = hashNoise(module.id * 131 + beatIndex * 17 + Math.floor(snareReactive * 100) * 7)
                const snareBurst = snareReactive > 0.38 && snareGate > 0.86
                  ? clamp01((snareReactive - 0.38) * 1.9 + (snareGate - 0.86) * 2.8)
                  : 0
                const proxyReactiveScale = isProxyModule ? 0.45 : 1
                const snareBurstEffective = isProxyModule ? snareBurst * 0.18 : snareBurst
                const reactiveSignal = clamp01(Math.max(syncFlash, audioPulse * 0.55, hopFlash * 0.72, backendBeat, snareBurstEffective, musicBassDrop, musicVelocity * 0.84) * proxyReactiveScale)
                const flashVariance = 0.85 + hashNoise(module.id * 43 + beatIndex * 11 + backendSequenceStep * 5) * 0.45
                const audioTempoFlash = audioReactiveConnected ? clamp01(audioPulse * 0.22 + hardAudioFlash * 0.98 + musicTempoLock * 0.32) : 0
                const haloFlash = clamp01(Math.max(syncFlash * 0.6, audioTempoFlash) * flashVariance)
                const reactiveGlowClass = !isProxyModule && reactiveSignal > 0.08 ? 'reactive-glow' : ''
                const reactiveBorderClass = !isProxyModule && reactiveSignal > 0.12 ? 'reactive-border' : ''
                const glowTierClass = !isProxyModule && reactiveSignal > 0.8 ? 'glow-strong' : !isProxyModule && reactiveSignal > 0.45 ? 'glow-medium' : !isProxyModule && reactiveSignal > 0.12 ? 'glow-soft' : ''
                const pulseDurationMs = Math.round(Math.max(isProxyModule ? 680 : 380, beatDurationMs * ((isProxyModule ? 1.02 : 0.72) + hashNoise(module.id * 59 + beatIndex * 2) * (isProxyModule ? 0.35 : 0.9))))
                const pulseDelayMs = Math.round(hashNoise(module.id * 83 + beatIndex * 7 + backendSequenceStep * 5) * 220)
                const borderPulseStrength = audioReactiveConnected
                  ? clamp01((hopFlash * 1.06 + audioPulse * 0.24) * (isProxyModule ? 0.46 : 1))
                  : (backendFlashOn ? clamp01(0.55 + backendGlow * 0.35) : 0)
                const edgeJitter = hashNoise(module.id * 97 + beatIndex * 5 + Math.floor(audioPulse * 100) * 13)
                const reactiveEdge = clamp01((reactiveSignal * 0.78 + audioPulse * 0.42 + hopFlash * 0.65) * (isProxyModule ? 0.5 : 1))
                const edgeHighlightScale = 1 + reactiveEdge * (0.12 + edgeJitter * 0.2)
                const edgeHighlightOpacity = 0.14 + reactiveEdge * (0.48 + edgeJitter * 0.28)
                const edgeHighlightBlur = 8 + reactiveEdge * (22 + edgeJitter * 18)
                const borderFlashDurationMs = Math.round(Math.max(isProxyModule ? 520 : 240, beatDurationMs * (0.52 + hashNoise(module.id * 47 + beatIndex * 3) * (isProxyModule ? 0.25 : 0.46))))
                const borderFlashDelayMs = Math.round(hashNoise(module.id * 71 + beatIndex * 11 + backendSequenceStep * 7) * 180)
                const moduleBandSkew = hashNoise(module.id * 61 + beatIndex * 3.1 + backendSequenceStep * 0.45)
                const moduleBass = clamp01(effectiveBass * (0.64 + moduleBandSkew * 0.46) + syncFlash * 0.12 + musicBassDrop * 0.18)
                const moduleMid = clamp01(effectiveMid * (0.6 + (1 - moduleBandSkew) * 0.42) + syncFlash * 0.14 + musicTempoLock * 0.12)
                const moduleTreble = clamp01(effectiveTreble * (0.56 + Math.abs(0.5 - moduleBandSkew) * 0.56) + syncFlash * 0.12 + musicNoteAccent * 0.16)
                const moduleBandTotal = Math.max(0.001, moduleBass + moduleMid + moduleTreble)
                const bassMix = moduleBass / moduleBandTotal
                const midMix = moduleMid / moduleBandTotal
                const trebleMix = moduleTreble / moduleBandTotal
                const moduleCoreR = Math.round(255 * bassMix + 123 * midMix + 0 * trebleMix)
                const moduleCoreG = Math.round(170 * bassMix + 97 * midMix + 245 * trebleMix)
                const moduleCoreB = Math.round(64 * bassMix + 255 * midMix + 255 * trebleMix)
                const moduleAccentR = Math.round(24 * bassMix + 172 * midMix + 255 * trebleMix)
                const moduleAccentG = Math.round(255 * bassMix + 96 * midMix + 170 * trebleMix)
                const moduleAccentB = Math.round(130 * bassMix + 255 * midMix + 90 * trebleMix)
                const moduleCore = `${moduleCoreR},${moduleCoreG},${moduleCoreB}`
                const moduleAccent = `${moduleAccentR},${moduleAccentG},${moduleAccentB}`
                const hopFlashDisplay = isProxyModule ? hopFlash * 0.38 : hopFlash
                const haloFlashDisplay = isProxyModule ? haloFlash * 0.42 : haloFlash
                const syncFlashDisplay = isProxyModule ? syncFlash * 0.5 : syncFlash
                const glowSignal = isProxyModule ? reactiveSignal * 0.5 : reactiveSignal
                const snareDisplay = isProxyModule ? snareBurstEffective : snareBurst

                return (
                <div
                  key={module.id}
                  data-module-card="true"
                  className={`orch-module absolute rounded-md bg-[rgba(2,12,22,0.90)] px-2 py-1 text-[8px] uppercase tracking-[0.16em] ${module.retiring ? 'opacity-70' : ''} ${module.expanded ? 'shadow-[0_0_18px_rgba(0,245,255,0.18)]' : ''} ${reactiveGlowClass} ${reactiveBorderClass} ${glowTierClass}`}
                  style={{
                    left: `${module.x}%`,
                    top: `${module.y}%`,
                    width: module.expanded ? '180px' : '136px',
                    borderColor: `rgba(${moduleCore},${0.06 + glowSignal * 0.92})`,
                    boxShadow: `0 0 ${3 + glowSignal * 96 + snareDisplay * 34 + musicVelocity * 16}px rgba(${moduleCore},${0.06 + glowSignal * 0.56 + snareDisplay * 0.16}), 0 0 ${2 + glowSignal * 70 + snareDisplay * 28}px rgba(${moduleAccent},${0.05 + glowSignal * 0.44 + snareDisplay * 0.2}), 0 0 ${1 + glowSignal * 30 + snareDisplay * 20}px rgba(255,255,255,${glowSignal * 0.26 + snareDisplay * 0.24})`,
                    filter: `saturate(${0.92 + glowSignal * 0.48 + snareDisplay * 0.28 + musicTempoLock * 0.2}) brightness(${0.86 + glowSignal * 0.7 + snareDisplay * 0.3 + musicVelocity * 0.14})`,
                    transform: `scale(${1 + glowSignal * 0.05 + snareDisplay * 0.03 + musicBassDrop * 0.02})`,
                    animationDuration: `${pulseDurationMs}ms`,
                    animationDelay: `${pulseDelayMs}ms`,
                    ['--border-flash-boost' as any]: `${0.75 + Math.max(borderPulseStrength, reactiveSignal) * 1.25}`,
                    ['--border-flash-opacity' as any]: `${0.12 + Math.max(borderPulseStrength, reactiveSignal) * 0.76}`,
                    ['--border-flash-duration' as any]: `${borderFlashDurationMs}ms`,
                    ['--border-flash-delay' as any]: `${borderFlashDelayMs}ms`,
                    ['--reactive-signal' as any]: `${reactiveSignal}`,
                    ['--reactive-duration' as any]: `${pulseDurationMs}ms`,
                    ['--edge-highlight-scale' as any]: `${edgeHighlightScale}`,
                    ['--edge-highlight-opacity' as any]: `${edgeHighlightOpacity}`,
                    ['--edge-highlight-blur' as any]: `${edgeHighlightBlur}px`,
                    ['--edge-highlight-duration' as any]: `${Math.max(300, Math.round(pulseDurationMs * (0.7 + edgeJitter * 0.7)))}ms`,
                    cursor: 'grab',
                    userSelect: 'none',
                    touchAction: 'none',
                  }}
                  onClick={() => {
                    if (moduleClickBlockRef.current) return
                    toggleModuleExpanded(module.id)
                  }}
                >
                  <div
                    className="pointer-events-none absolute -inset-3 rounded-md border"
                    style={{
                      borderColor: `rgba(${moduleCore},${hopFlashDisplay * 0.88 + musicBassDrop * 0.08})`,
                      boxShadow: `0 0 ${8 + hopFlashDisplay * 20 + musicVelocity * 8}px rgba(${moduleCore},${hopFlashDisplay * 0.46}), 0 0 ${14 + hopFlashDisplay * 24}px rgba(${moduleAccent},${hopFlashDisplay * 0.28})`,
                      opacity: hopFlashDisplay,
                      transform: `scale(${1 + hopFlashDisplay * 0.16 + musicVelocity * 0.03})`,
                      transition: 'opacity 120ms ease, transform 120ms ease, box-shadow 120ms ease',
                    }}
                  />
                  <div
                    className="pointer-events-none absolute rounded-[999px]"
                    style={{
                      top: '-150%',
                      right: '-150%',
                      bottom: '-150%',
                      left: '-150%',
                      background: `radial-gradient(circle at 28% 30%, rgba(${moduleCore},${haloFlashDisplay * 0.82}) 0%, rgba(${moduleCore},${haloFlashDisplay * 0.26}) 38%, transparent 76%), radial-gradient(circle at 70% 66%, rgba(${moduleAccent},${haloFlashDisplay * 0.72}) 0%, rgba(${moduleAccent},${haloFlashDisplay * 0.24}) 40%, transparent 78%), radial-gradient(circle at 52% 52%, rgba(255,255,255,${haloFlashDisplay * 0.34}) 0%, transparent 72%)`,
                      opacity: 0.005 + haloFlashDisplay * 0.86 + musicVelocity * 0.08,
                      filter: `blur(${16 + haloFlashDisplay * 44 + musicBassDrop * 8}px)`,
                      transform: `scale(${1 + haloFlashDisplay * 1.8 + musicBassDrop * 0.04})`,
                      transformOrigin: 'center',
                      mixBlendMode: 'screen',
                    }}
                  />
                  <div
                    className="pointer-events-none absolute inset-0 rounded-md"
                    style={{
                      background: `radial-gradient(circle at 30% 28%, rgba(${moduleCore},${0.1 + audioGlow * 0.12 + syncFlashDisplay * 0.34 + musicBassDrop * 0.08}) 0%, transparent 42%), radial-gradient(circle at 72% 70%, rgba(${moduleAccent},${0.06 + backendGlow * 0.12 + syncFlashDisplay * 0.26 + musicNoteAccent * 0.08}) 0%, transparent 46%), radial-gradient(circle at 50% 50%, rgba(255,255,255,${0.03 + logPressure * 0.06 + syncFlashDisplay * 0.18}) 0%, transparent 62%), radial-gradient(circle at 48% 52%, rgba(255,255,255,${syncFlashDisplay * 0.34 + musicVelocity * 0.08}) 0%, transparent 45%)`,
                      opacity: 0.04 + backendGlow * 0.04 + syncFlashDisplay * 0.92 + musicVelocity * 0.08,
                      mixBlendMode: 'screen',
                    }}
                  />
                  <div
                    className="pointer-events-none absolute inset-0 rounded-md border"
                    style={{
                      borderColor: `rgba(${moduleCore},${0.04 + audioGlow * 0.08 + syncFlashDisplay * 0.84 + musicBassDrop * 0.08})`,
                      boxShadow: `0 0 ${6 + audioGlow * 4 + syncFlashDisplay * 40 + musicVelocity * 8}px rgba(${moduleCore},${0.05 + audioGlow * 0.08 + syncFlashDisplay * 0.34}), inset 0 0 ${4 + backendGlow * 4 + syncFlashDisplay * 18}px rgba(${moduleAccent},${0.02 + backendGlow * 0.05 + syncFlashDisplay * 0.16})`,
                      opacity: 0.02 + audioGlow * 0.04 + syncFlashDisplay * 0.96 + musicVelocity * 0.06,
                      transform: `scale(${1 + audioGlow * 0.01 + syncFlashDisplay * 0.03 + musicBassDrop * 0.02})`,
                    }}
                  />
                  <div
                    className="relative flex cursor-grab items-center justify-between gap-2 rounded border border-transparent px-1 py-1 active:cursor-grabbing hover:border-[var(--border)]/50"
                    data-module-drag-handle="true"
                    onPointerDown={event => beginModuleDrag(event, module.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-1 rounded-full bg-[var(--c1)] opacity-70" />
                      <div className="text-[var(--muted)]">{module.label}</div>
                    </div>
                    {module.kind === 'proxy' && (
                      <div className="rounded border border-[rgba(0,245,255,0.35)] px-1 py-0.5 text-[7px] text-[rgba(0,245,255,0.9)]">proxy</div>
                    )}
                  </div>
                  <div className="mt-1 text-[9px] text-[var(--text)]">{module.sourceId} → {module.targetId}</div>
                  <div className="mt-1 text-[8px] text-[var(--muted)]">{module.detail}</div>
                  <div className="mt-1 text-[8px] text-[var(--muted)]">TTL {Math.max(0, Math.ceil(module.ttl / 1000))}s · Q {tasks.length} · L {logs.length}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(6, clamp01(1 - module.ttl / Math.max(1, module.maxTtl)) * 100)}%`,
                        background: `linear-gradient(90deg, ${module.retiring ? 'rgba(255,170,0,0.92)' : `rgba(${moduleCore},0.95)`}, rgba(${moduleAccent},${0.72 + backendGlow * 0.24}))`,
                        boxShadow: `0 0 ${4 + audioGlow * 4 + taskPressure * 4 + syncFlash * 28}px rgba(${moduleCore},${0.08 + audioGlow * 0.08 + syncFlash * 0.3}), 0 0 ${3 + backendGlow * 5 + syncFlash * 20}px rgba(${moduleAccent},${0.06 + backendGlow * 0.08 + syncFlash * 0.24})`,
                      }}
                    />
                  </div>
                  {module.expanded && (
                    <div className="mt-2 rounded border border-[var(--border)] bg-black/20 p-2 text-[8px] leading-5 text-[var(--muted)] normal-case">
                      {module.kind === 'proxy'
                        ? `Proxy module mirrors a fast backend micro-operation: ${module.detail}. It appears briefly, tracks routing between ${module.sourceId} and ${module.targetId}, then retires automatically.`
                        : 'Base module online. Drag to relocate, click to collapse, and let it auto-stabilize between source and target nodes.'}
                    </div>
                  )}
                </div>
              )})}

              {nodes.map(node => (
                (() => {
                  const flashEffect = nodeFlashLookup.get(node.id)
                  const completionFlash = flashEffect?.strength ?? 0
                  const completionColor = flashEffect?.color ?? '#22c55e'
                  const centerDistance = Math.hypot(node.x - 50, node.y - 50)
                  const centerDepth = clamp01(1 - centerDistance / 64)
                  const nodeBandHit = node.id === 'sig' || node.id === 'src' || node.id === 'ion'
                    ? effectiveBass
                    : node.id === 'cbe' || node.id === 'elx' || node.id === 'flow' || node.id === 'task'
                      ? effectiveMid
                      : effectiveTreble
                  const priorityFactor = IMPORTANT_NODE_IDS.has(node.id) ? 1.42 : 1
                  const nodeReactive = clamp01(nodeBandHit * 0.74 + effectiveAudioPulse * 0.28 + centerDepth * 0.24 + completionFlash * 0.5 + musicNoteAccent * 0.16 + musicBassDrop * 0.12)
                  const nodeScale = 1 + nodeReactive * 0.05 * priorityFactor + completionFlash * 0.08 + musicVelocity * 0.02

                  return (
                <div
                  key={node.id}
                  data-node-card="true"
                  className={`absolute w-[260px] rounded-lg border bg-[rgba(4,15,30,0.92)] backdrop-blur-sm transition-all ${node.expanded ? 'shadow-[0_0_28px_rgba(0,245,255,0.25)]' : ''}`}
                  style={{
                    ...percentPosition(node.x, node.y),
                    borderColor: completionFlash > 0.02 ? `${completionColor}${Math.round(80 + completionFlash * 70).toString(16).padStart(2, '0')}` : `${node.color}55`,
                    boxShadow: `0 0 0 1px rgba(0,0,0,0.14), 0 0 ${16 + audioGlow * 14 + nodeReactive * 20 * priorityFactor + musicVelocity * 10}px ${node.color}1f, 0 0 ${10 + backendGlow * 15 + nodeReactive * 20}px rgba(0,245,255,${0.06 + backendGlow * 0.1 + nodeReactive * 0.16}), 0 0 ${completionFlash * 52}px rgba(52,211,153,${completionFlash * 0.62})`,
                    filter: `saturate(${1 + audioGlow * 0.14 + nodeReactive * 0.3 + musicTempoLock * 0.18}) brightness(${1 + backendGlow * 0.05 + nodeReactive * 0.2 + musicVelocity * 0.08})`,
                    transform: `scale(${nodeScale})`,
                    transformOrigin: '50% 50%',
                    cursor: 'grab',
                    userSelect: 'none',
                    touchAction: 'none',
                  }}
                  onDoubleClick={() => toggleNodeExpanded(node.id)}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={() => {
                    if (nodeClickBlockRef.current) return
                    toggleNodeExpanded(node.id)
                  }}
                >
                  {completionFlash > 0.02 && (
                    <div
                      className="pointer-events-none absolute -inset-2 rounded-lg border"
                      style={{
                        borderColor: `rgba(52,211,153,${0.22 + completionFlash * 0.58})`,
                        boxShadow: `0 0 ${14 + completionFlash * 32}px rgba(52,211,153,${0.22 + completionFlash * 0.42})`,
                        opacity: 0.32 + completionFlash * 0.58,
                        transform: `scale(${1 + completionFlash * 0.22})`,
                      }}
                    />
                  )}
                  <div
                    className="flex cursor-grab items-center gap-2 border-b border-[var(--border)] px-3 py-2 active:cursor-grabbing"
                    data-node-drag-handle="true"
                    onPointerDown={event => beginNodeDrag(event, node.id)}
                  >
                    <div className="text-[14px]" style={{ color: node.color }}>{node.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text)]">{node.title}</div>
                      <div className="text-[7px] uppercase tracking-[0.14em] text-[var(--muted)]">{node.tag}</div>
                    </div>
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${node.activity > 0.7 ? 'bg-[var(--c3)]' : node.activity > 0.4 ? 'bg-[var(--warn)]' : 'bg-[var(--border2)]'}`}
                      style={{ boxShadow: `0 0 ${8 + audioGlow * 14 + musicBassDrop * 8}px ${node.color}, 0 0 ${10 + backendGlow * 10}px rgba(0,245,255,${0.12 + backendGlow * 0.12})` }}
                    />
                  </div>
                  <div className="px-3 py-2">
                    {node.metrics.map((metric, index) => (
                      <div key={metric} className="mb-1 flex items-center justify-between">
                        <span className="text-[8px] uppercase tracking-[0.12em] text-[var(--muted)]">{metric}</span>
                        <span className="text-[10px] font-semibold text-[var(--text)]">{Math.round(node.activity * 100 + index * 7)}</span>
                      </div>
                    ))}
                    <div className="mt-2 h-[42px]">
                      <SparkLine data={nodeSeries[node.id] ?? []} color={node.color} height={42} />
                    </div>
                    <div className="mt-1 text-[8px] leading-5 text-[var(--c1)]/60">
                      › {NODE_LOG_LINES[node.id][Math.floor(now / 3000 + Object.keys(NODE_LOG_LINES).indexOf(node.id)) % NODE_LOG_LINES[node.id].length]}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <div className="h-1.5 flex-1 rounded-full bg-[var(--border)] overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(8, node.activity * 100)}%`, background: `linear-gradient(90deg, ${node.color}, ${color})`, boxShadow: `0 0 ${8 + audioGlow * 12 + musicVelocity * 8}px ${node.color}` }} />
                      </div>
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--c1)]" style={{ opacity: 0.35 + audioGlow * 0.65 + musicNoteAccent * 0.08, boxShadow: `0 0 ${10 + audioGlow * 12 + musicBassDrop * 8}px ${node.color}` }} />
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                      <div className="h-full rounded-full" style={{ width: `${node.activity * 100}%`, background: `linear-gradient(90deg, ${node.color}, ${color})`, boxShadow: `0 0 ${6 + backendGlow * 10 + musicVelocity * 8}px ${node.color}` }} />
                    </div>
                    {node.expanded && (
                      <div className="mt-2 rounded border border-[var(--border)] bg-black/20 p-2 text-[8px] leading-5 text-[var(--muted)]">
                        <div className="mb-1 uppercase tracking-[0.14em] text-[var(--border2)]">Expanded View</div>
                        Node activity {Math.round(node.activity * 100)}% · linked to orchestration stream · click to collapse.
                      </div>
                    )}
                  </div>
                </div>
                  )
                })()
              ))}
            </div>
          </div>
        </Panel>

        <div className={`flex min-h-0 flex-col gap-3 xl:sticky xl:top-0 ${boardLayout.sideHeight} xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1`}>
          <Panel title="Operational Metrics" accent={color} className="shrink-0">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
              {[
                ['Signals/sec', String(boardMetrics.signalsPerSec)],
                ['Active Bridges', String(boardMetrics.activeBridges)],
                ['Lattice Nodes', String(boardMetrics.latticeNodes)],
                ['Tasks/min', String(boardMetrics.tasksPerMin)],
                ['Coherence', `${boardMetrics.coherence}%`],
                ['Uptime', boardMetrics.uptimeText],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-2">
                  <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--muted)]">{label}</div>
                  <div className="mt-1 text-[14px] font-bold tracking-[0.08em] leading-none" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Control Surface" accent={color} className="shrink-0">
            <div className="grid gap-4 xl:grid-cols-1">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  <span>Shared chaos</span>
                  <span style={{ color }}>{Math.round(chaos * 100)}%</span>
                </div>
                <Fader value={chaos} min={0} max={1} onChange={setChaos} length={320} color={color} label="Chaos Level" />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  <span>Entropy</span>
                  <span style={{ color }}>{Math.round(entropy * 100)}%</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${entropy * 100}%`, background: color }} />
                </div>
                <Toggle value={!locked} onChange={value => lockChaos(!value)} label={locked ? 'LOCKED' : 'ACTIVE'} color={color} />
              </div>

              <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface2)] p-3">
                <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--muted)]">Quick Presets</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    ['deterministic', 'Deterministic'],
                    ['balanced', 'Balanced'],
                    ['creative', 'Creative'],
                    ['chaos', 'Chaos'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className="rounded border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)]"
                      onClick={() => applyPreset(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Audio</div>
                <button
                  className="rounded border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)]"
                  onClick={startAudio}
                >
                  {audioStatus === 'AUDIO OFF' ? 'Enable Audio React' : 'Disable Audio React'}
                </button>
                <div className="text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">{audioStatus}</div>
                {audioReactiveConnected && (
                  <div className="text-[8px] uppercase tracking-[0.12em] text-[var(--border2)]">Beat Chase {sequencerBpm} BPM</div>
                )}
                <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${audioLevel * 100}%`, background: color }} />
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Autonomous Task Queue" subtitle={`${tasks.length} active${orchestrationConnected ? ' · live' : ''}`} accent={color} className="min-h-[240px]" scrollable>
            <div className="flex flex-col gap-2">
              {tasks.map(task => (
                <div key={task.id} className={`rounded-md border px-3 py-2 text-[8px] leading-5 ${task.depth > 0 ? 'ml-3 border-[var(--border)]/60 bg-[var(--surface2)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text)]">{task.name}</div>
                    <div className={`rounded px-1.5 py-0.5 uppercase tracking-[0.12em] ${task.status === 'running' ? 'bg-[rgba(0,245,255,0.12)] text-[var(--c1)]' : 'bg-[rgba(255,170,0,0.10)] text-[var(--warn)]'}`}>{task.status}</div>
                  </div>
                  <div className="text-[8px] uppercase tracking-[0.08em] text-[var(--muted)]">{task.path}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--c1)] to-[var(--c3)]" style={{ width: `${task.progress}%` }} /></div>
                  <div className="mt-1 flex items-center justify-between text-[7px] uppercase tracking-[0.14em] text-[var(--border2)]">
                    <span>{task.source}</span>
                    <span>{Math.round(task.progress)}%</span>
                  </div>
                </div>
              ))}
              {tasks.length === 0 && <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">No active tasks</div>}
            </div>
          </Panel>

          <Panel title="Task Archive" subtitle={`${archive.length} archived${orchestrationConnected ? ' · live' : ''}`} accent={color} className="min-h-[170px]" scrollable>
            <div className="flex flex-col gap-2">
              {archive.map(task => (
                <div key={task.id} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[8px] leading-5 text-[var(--muted)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--c2)]">{task.name}</div>
                    <div className="uppercase tracking-[0.12em] text-[var(--border2)]">archived</div>
                  </div>
                  <div className="text-[8px] uppercase tracking-[0.08em]">{task.path}</div>
                  <div className="mt-1 text-[7px] uppercase tracking-[0.12em] text-[var(--border2)]">{task.source}</div>
                </div>
              ))}
              {archive.length === 0 && <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">No archived tasks</div>}
            </div>
          </Panel>

          <Panel title="System Log" subtitle={`${logs.length} entries${orchestrationConnected ? ' · live' : ''}`} accent={color} className="min-h-[220px]" scrollable>
            <div className="flex flex-col gap-1">
              {logs.map(entry => (
                <div key={entry.id} className="flex gap-2 border-b border-[var(--border)]/40 px-1 py-1 text-[8px]">
                  <div className="min-w-[58px] text-[var(--border2)]">{entry.ts}</div>
                  <div className="min-w-[40px] text-[var(--c2)]">{entry.source}</div>
                  <div className={`flex-1 ${entry.kind === 'ok' ? 'text-[var(--c3)]' : entry.kind === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--red)]'}`}>{entry.message}</div>
                </div>
              ))}
              {logs.length === 0 && <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">No logs yet</div>}
            </div>
          </Panel>

        </div>

      </div>
    </div>
  )
}
