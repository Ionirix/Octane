import type { WeatherRadarFrame } from '@/modules/weather/types'

type RadarLayerProps = {
  frame?: WeatherRadarFrame
  visible: boolean
  opacity: number
}

export function RadarLayer({ frame, visible, opacity }: RadarLayerProps) {
  return (
    <div className="weather-radar-chip">
      <div className="weather-radar-chip__title">Radar</div>
      <div className="weather-radar-chip__meta">
        {visible ? 'On' : 'Off'} · {Math.round(opacity * 100)}%
      </div>
      <div className="weather-radar-chip__meta">
        {frame ? new Date(frame.timestamp).toLocaleString('en', { hour12: false }) : 'No frame selected'}
      </div>
      {frame?.stale ? <div className="weather-radar-chip__stale">Delayed frame</div> : null}
    </div>
  )
}
