import { NavLink } from 'react-router-dom'
import { useChaosStore } from '@state/chaos'
import { getChaosColor } from '@theme/tokens'
import clsx from 'clsx'
import {
  LayoutDashboard, Activity, Radio, Sliders, Film, Mic2, Cpu,
  Image, MessageSquare, Zap, Database, GitBranch, BarChart2,
  Orbit, Cable, Network, Shield, Waypoints, Scale, Workflow, Radar, CloudRain,
} from 'lucide-react'

const NAV_GROUPS = [
  {
    label: 'V6 COMMAND',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Command Center' },
      { to: '/surveillance', icon: Radar, label: 'Surveillance' },
      { to: '/weather', icon: CloudRain, label: 'Weather Intel' },
      { to: '/v5/src', icon: Orbit, label: 'Stellar Reach (SRC)' },
      { to: '/v5/cbe', icon: Cable, label: 'Civilization Bridge (CBE)' },
      { to: '/v5/elx', icon: Network, label: 'Existence Lattice (ELX)' },
      { to: '/v5/oan', icon: Shield, label: 'Ascension Node (OAN)' },
      { to: '/v5/flows', icon: Waypoints, label: 'Flow Models' },
      { to: '/v5/governance', icon: Scale, label: 'Governance' },
      { to: '/v5/metrics', icon: BarChart2, label: 'v5 Metrics' },
      { to: '/orchestration', icon: Workflow, label: 'Orchestration' },
    ],
  },
  {
    label: 'LEGACY SUITE',
    items: [
      { to: '/telemetry', icon: Activity, label: 'Telemetry' },
      { to: '/operator', icon: Sliders, label: 'Operator' },
      { to: '/audio', icon: Mic2, label: 'Audio Engine' },
      { to: '/scene', icon: Film, label: 'Scene Complexity' },
      { to: '/output', icon: Radio, label: 'Master Output' },
      { to: '/diagnostics', icon: Cpu, label: 'Diagnostics' },
    ],
  },
  {
    label: 'CREATION',
    items: [
      { to: '/imagegen', icon: Image, label: 'Image Studio' },
      { to: '/ai', icon: MessageSquare, label: 'Ion AI' },
    ],
  },
  {
    label: 'CHAOS GOVERNOR',
    items: [
      { to: '/chaos', icon: Zap, label: 'Chaos Governor' },
      { to: '/memory', icon: Database, label: 'Memory Fabric' },
      { to: '/agent', icon: GitBranch, label: 'Agent Workflow' },
      { to: '/entropy', icon: BarChart2, label: 'Entropy Monitor' },
    ],
  },
]

interface SideNavProps {
  mobileOpen?: boolean
  onNavigate?: () => void
}

export function SideNav({ mobileOpen = false, onNavigate }: SideNavProps) {
  const chaos = useChaosStore(state => state.chaos)
  const color = getChaosColor(chaos)

  return (
    <nav
      className={clsx(
        'relative z-[7000] md:w-[190px] md:shrink-0 md:flex md:flex-col border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto',
        'fixed md:relative inset-y-0 left-0 transition-transform duration-200 ease-out',
        mobileOpen
          ? 'w-[190px] translate-x-0 pointer-events-auto flex flex-col'
          : 'w-0 -translate-x-full pointer-events-none md:w-[190px] md:translate-x-0 md:pointer-events-auto md:flex',
      )}
    >
      {NAV_GROUPS.map(group => (
        <div key={group.label} className="py-2">
          <div className="px-3 py-1.5 text-[8px] font-semibold tracking-[0.15em] text-[var(--border2)] uppercase">
            {group.label}
          </div>
          {group.items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              className={({ isActive }) => clsx(
                'flex items-center gap-2.5 px-3 py-1.5 text-[11px] transition-all group',
                isActive
                  ? 'text-[var(--text)] bg-[var(--surface2)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]',
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute left-0 w-0.5 h-5 rounded-r" style={{ background: color }} />}
                  <item.icon size={12} style={isActive ? { color } : {}} />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="mt-auto p-3 border-t border-[var(--border)]">
        <div className="text-[8px] text-[var(--border2)] text-center">IONIRIX LLC · OCTANE v6 + Legacy</div>
      </div>
    </nav>
  )
}
