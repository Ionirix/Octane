import type { WeatherEnvLayerType, WeatherLayerData } from '@/modules/weather/types'

const LAYER_LABELS: Record<WeatherEnvLayerType, string> = {
  precipitation: 'Precipitation',
  wind: 'Wind',
  pressure: 'Pressure',
  smoke: 'Smoke',
}

type EnvLayerProps = {
  dataByLayer: Partial<Record<WeatherEnvLayerType, WeatherLayerData>>
  active: Record<WeatherEnvLayerType, boolean>
}

export function EnvLayer({ dataByLayer, active }: EnvLayerProps) {
  const visibleTypes = (Object.keys(active) as WeatherEnvLayerType[]).filter((type) => active[type])

  if (visibleTypes.length === 0) {
    return (
      <div className="weather-info-card text-[11px] text-[var(--muted)]">
        Enable environmental layers to display legends and units.
      </div>
    )
  }

  return (
    <div className="weather-info-card space-y-2">
      <div className="weather-info-card__title">Active Layer Legends</div>
      {visibleTypes.map((type) => {
        const layer = dataByLayer[type]
        return (
          <div key={type} className="space-y-1">
            <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              {LAYER_LABELS[type]} {layer?.units ? `(${layer.units})` : ''}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(layer?.legend ?? []).map((entry) => (
                <span key={`${type}-${entry.label}`} className="weather-legend-pill">
                  <span className="weather-legend-swatch" style={{ backgroundColor: entry.color }} />
                  {entry.label}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
