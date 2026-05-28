import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AppShell } from '@components/layout/AppShell'

const Spinner = () => (
  <div className="flex items-center justify-center h-full">
    <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"/>
  </div>
)

function L(factory: () => Promise<{ default: React.ComponentType }>) {
  const C = lazy(factory)
  return <Suspense fallback={<Spinner />}><C /></Suspense>
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { path: 'surveillance', element: L(() => import('@screens/Surveillance')) },
      { path: 'weather',      element: L(() => import('@screens/WeatherIntelligence')) },
      { path: 'orchestration', element: L(() => import('@screens/Orchestration')) },
      { index: true,          element: L(() => import('@screens/v5/V5CommandCenter')) },
      { path: 'v5/src',       element: L(() => import('@screens/v5/V5StellarReach')) },
      { path: 'v5/cbe',       element: L(() => import('@screens/v5/V5CivilizationBridge')) },
      { path: 'v5/elx',       element: L(() => import('@screens/v5/V5ExistenceLattice')) },
      { path: 'v5/oan',       element: L(() => import('@screens/v5/V5AscensionNode')) },
      { path: 'v5/flows',     element: L(() => import('@screens/v5/V5FlowModels')) },
      { path: 'v5/governance',element: L(() => import('@screens/v5/V5Governance')) },
      { path: 'v5/metrics',   element: L(() => import('@screens/v5/V5Metrics')) },
      { path: 'telemetry',    element: L(() => import('@screens/TelemetryConsole/index')) },
      { path: 'operator',     element: L(() => import('@screens/OperatorDashboard/index')) },
      { path: 'audio',        element: L(() => import('@screens/AudioEngineConsole/index')) },
      { path: 'scene',        element: L(() => import('@screens/SceneComplexity/index')) },
      { path: 'output',       element: L(() => import('@screens/MasterOutput/index')) },
      { path: 'diagnostics',  element: L(() => import('@screens/Diagnostics/index')) },
      { path: 'imagegen',     element: L(() => import('@screens/ImageGen/index')) },
      { path: 'ai',           element: L(() => import('@screens/OctaneAI/index')) },
      { path: 'chaos',        element: L(() => import('@screens/ChaosGovernor')) },
      { path: 'memory',       element: L(() => import('@screens/MemoryFabric')) },
      { path: 'agent',        element: L(() => import('@screens/AgentWorkflow')) },
      { path: 'entropy',      element: L(() => import('@screens/EntropyMonitor')) },
      { path: '*',            element: <Navigate to="/" replace />                  },
    ],
  },
])
