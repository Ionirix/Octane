type TimeScrubberProps = {
  times: string[]
  selectedTime: string | null
  mode: 'live' | 'history'
  onTimeChange: (timestamp: string) => void
  onStep: (direction: -1 | 1) => void
  onModeChange: (mode: 'live' | 'history') => void
  onJumpToLive: () => void
}

function formatTimelineTime(value: string): string {
  return new Date(value).toLocaleTimeString('en', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TimeScrubber({ times, selectedTime, mode, onTimeChange, onStep, onModeChange, onJumpToLive }: TimeScrubberProps) {
  const selectedIndex = Math.max(0, times.findIndex((value) => value === selectedTime))

  if (times.length === 0) {
    return (
      <div className="rounded border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[11px] text-[var(--muted)]">
        No radar timeline frames available yet.
      </div>
    )
  }

  return (
    <div className="weather-time-scrubber">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onModeChange('live')}
          className="weather-control-btn"
          aria-pressed={mode === 'live'}
        >
          Live Feed
        </button>
        <button
          type="button"
          onClick={() => onModeChange('history')}
          className="weather-control-btn"
          aria-pressed={mode === 'history'}
        >
          History
        </button>
        {mode === 'history' ? (
          <button
            type="button"
            onClick={onJumpToLive}
            className="weather-control-btn"
          >
            Jump To Live
          </button>
        ) : null}
      </div>

      {mode === 'history' ? (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStep(-1)}
              className="weather-control-btn"
              aria-label="Previous frame"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              className="weather-control-btn"
              aria-label="Next frame"
            >
              Next
            </button>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, times.length - 1)}
            value={selectedIndex}
            onChange={(event) => onTimeChange(times[Number(event.target.value)] ?? times[0])}
            className="w-full accent-[var(--accent)]"
          />

          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            <span>{formatTimelineTime(times[0])}</span>
            <span>{selectedTime ? formatTimelineTime(selectedTime) : '--:--'}</span>
            <span>{formatTimelineTime(times[times.length - 1])}</span>
          </div>
        </>
      ) : (
        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
          Live feed active. Map refreshes every 10 seconds with directional continuity.
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
        <span>Window: last 24h</span>
        <span>{mode === 'live' ? 'Mode: live' : 'Mode: history'}</span>
      </div>
    </div>
  )
}
