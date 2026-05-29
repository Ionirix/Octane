import type { WeatherEnvLayerType, WeatherLayerType } from '@/modules/weather/types'

type LayerControlPanelProps = {
  activeLayers: {
    radar: boolean
    storms: boolean
    precipitation: boolean
    wind: boolean
    pressure: boolean
    smoke: boolean
    cloudCoverage: boolean
    stormCloudCoverage: boolean
    hurricaneRainRadar: boolean
    lightningTracking: boolean
  }
  layerOpacity: {
    radar: number
    precipitation: number
    wind: number
    pressure: number
    smoke: number
    cloudCoverage: number
    stormCloudCoverage: number
    hurricaneRainRadar: number
    lightningTracking: number
  }
  onToggleLayer: (layer: WeatherLayerType) => void
  onOpacityChange: (layer: 'radar' | WeatherEnvLayerType, opacity: number) => void
}

const ENV_TYPES: WeatherEnvLayerType[] = [
  'precipitation',
  'wind',
  'pressure',
  'smoke',
  'cloudCoverage',
  'stormCloudCoverage',
  'hurricaneRainRadar',
  'lightningTracking',
]

function prettyLayerLabel(type: string): string {
  if (type === 'cloudCoverage') return 'Cloud Coverage'
  if (type === 'stormCloudCoverage') return 'Storm Cloud Coverage'
  if (type === 'hurricaneRainRadar') return 'Hurricane Rain Radar'
  if (type === 'lightningTracking') return 'Lightning Tracking'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

export function LayerControlPanel({ activeLayers, layerOpacity, onToggleLayer, onOpacityChange }: LayerControlPanelProps) {
  return (
    <div className="weather-layer-panel">
      <div className="weather-layer-panel__title">Layer Controls</div>
      <button type="button" onClick={() => onToggleLayer('radar')} className="weather-control-btn w-full text-left">
        {activeLayers.radar ? 'Hide Radar' : 'Show Radar'}
      </button>
      <label className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
        Opacity
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(layerOpacity.radar * 100)}
          onChange={(event) => onOpacityChange('radar', Number(event.target.value) / 100)}
          className="w-24 accent-[var(--accent)]"
        />
      </label>

      <button type="button" onClick={() => onToggleLayer('storms')} className="weather-control-btn w-full text-left">
        {activeLayers.storms ? 'Hide Storm Cells' : 'Show Storm Cells'}
      </button>

      {ENV_TYPES.map((type) => (
        <div key={type} className="space-y-1.5">
          <button type="button" onClick={() => onToggleLayer(type)} className="weather-control-btn w-full text-left">
            {activeLayers[type] ? `Hide ${prettyLayerLabel(type)}` : `Show ${prettyLayerLabel(type)}`}
          </button>
          <label className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
            Opacity
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(layerOpacity[type] * 100)}
              onChange={(event) => onOpacityChange(type, Number(event.target.value) / 100)}
              className="w-24 accent-[var(--accent)]"
            />
          </label>
        </div>
      ))}
    </div>
  )
}
