import type { WeatherStormCell } from '@/modules/weather/types'

type StormLayerProps = {
  selectedStorm?: WeatherStormCell
}

export function StormLayer({ selectedStorm }: StormLayerProps) {
  if (!selectedStorm) {
    return (
      <div className="weather-info-card text-[11px] text-[var(--muted)]">
        Select a storm cell to inspect movement and intensity metadata.
      </div>
    )
  }

  return (
    <div className="weather-info-card">
      <div className="weather-info-card__title">{selectedStorm.name}</div>
      <div className="weather-info-grid">
        <span>Type</span>
        <span>{selectedStorm.type === 'hurricane' ? `Hurricane${selectedStorm.hurricaneCategory ? ` (Cat ${selectedStorm.hurricaneCategory})` : ''}` : 'Storm Cell'}</span>
        <span>ID</span>
        <span>{selectedStorm.id}</span>
        <span>Speed</span>
        <span>{selectedStorm.movement.speedKts} kt</span>
        <span>Heading</span>
        <span>{selectedStorm.movement.directionDeg} deg</span>
        <span>Intensity</span>
        <span>{selectedStorm.intensity.dbz} dBZ ({selectedStorm.intensity.category})</span>
        <span>Updated</span>
        <span>{new Date(selectedStorm.updatedAt).toLocaleTimeString('en', { hour12: false })}</span>
      </div>
    </div>
  )
}
