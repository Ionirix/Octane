import { useChaosStore } from '@state/chaos'
import { getChaosColor } from '@theme/tokens'
import { Activity, Lock, Menu, Unlock, Zap } from 'lucide-react'

interface TopBarProps {
  onMenuToggle?: () => void
}

export function TopBar({ onMenuToggle }: TopBarProps) {
  const chaos = useChaosStore(state => state.chaos)
  const entropy = useChaosStore(state => state.entropy)
  const locked = useChaosStore(state => state.locked)
  const lockChaos = useChaosStore(state => state.lockChaos)
  const color = getChaosColor(chaos)
  const pct = Math.round(chaos * 100)

  return (
    <header className="relative z-[7100] h-12 md:h-11 shrink-0 flex items-center justify-between px-2.5 md:px-4 border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <button
          onClick={onMenuToggle}
          className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
          aria-label="Toggle navigation"
        >
          <Menu size={14} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          <span className="text-[12px] md:text-[13px] font-bold tracking-widest" style={{ color }}>OCTANE</span>
          <span className="hidden sm:inline text-[9px] text-[var(--muted)] border border-[var(--border)] px-1.5 py-0.5 rounded">v6 AURORA + LEGACY</span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* Entropy */}
        <div className="hidden sm:flex items-center gap-1.5">
          <Activity size={10} className="text-[var(--muted)]" />
          <span className="text-[9px] text-[var(--muted)]">ENTROPY</span>
          <div className="w-16 h-1 rounded-full bg-[var(--border)] overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${entropy * 100}%`, background: color }} />
          </div>
          <span className="text-[9px] font-mono" style={{ color }}>{(entropy * 100).toFixed(0)}%</span>
        </div>

        {/* Chaos level */}
        <div className="flex items-center gap-1.5">
          <Zap size={10} style={{ color }} />
          <span className="hidden sm:inline text-[9px] text-[var(--muted)]">CHAOS</span>
          <div className="hidden sm:block w-16 h-1 rounded-full bg-[var(--border)] overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className="text-[9px] font-mono font-bold" style={{ color }}>{pct}%</span>
        </div>

        {/* Lock */}
        <button onClick={() => lockChaos(!locked)} className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
          {locked ? <Lock size={12} className="text-[#f59e0b]" /> : <Unlock size={12} />}
        </button>

        {/* Time */}
        <span className="hidden md:inline text-[9px] text-[var(--muted)] font-mono">
          {new Date().toLocaleTimeString('en', { hour12: false })}
        </span>
      </div>
    </header>
  )
}
