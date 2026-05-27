import { useCallback, useEffect, useMemo, useState } from 'react'
import { CloudRain, RefreshCcw } from 'lucide-react'
import { Panel } from '@components/primitives/Panel'
import { TimeScrubber } from '@/components/weather/TimeScrubber'
import { WeatherMapContainer } from '@/components/weather/WeatherMapContainer'
import { LayerControlPanel } from '@/components/weather/LayerControlPanel'
import { StormLayer } from '@/components/weather/StormLayer'
import { EnvLayer } from '@/components/weather/EnvLayer'
import { weatherDataService } from '@/modules/weather/WeatherDataService'
import type { WeatherEnvLayerType, WeatherLayerData, WeatherRadarFrame, WeatherStormCell } from '@/modules/weather/types'
import { useWeatherStore } from '@state/weather'

const RADAR_WINDOW_HOURS = 24
const RADAR_STEP_MINUTES = 10
const ENV_TYPES: WeatherEnvLayerType[] = ['precipitation', 'wind', 'pressure', 'smoke']
const TIMELINE_DEBOUNCE_MS = 160
const LIVE_REFRESH_MS = 10_000

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function estimateBoundsFromView(center: [number, number], zoom: number) {
  const scale = Math.max(1, 2 ** (zoom - 2))
  const latSpan = 48 / scale
  const lngSpan = 72 / scale
  return {
    west: Number((center[1] - lngSpan).toFixed(4)),
    south: Number(clamp(center[0] - latSpan, -85, 85).toFixed(4)),
    east: Number((center[1] + lngSpan).toFixed(4)),
    north: Number(clamp(center[0] + latSpan, -85, 85).toFixed(4)),
  }
}

function toBboxParam(
  bounds: { west: number; south: number; east: number; north: number } | undefined,
  center: [number, number],
  zoom: number,
): string {
  const next = bounds ?? estimateBoundsFromView(center, zoom)
  return `${next.west},${next.south},${next.east},${next.north}`
}

function toTitle(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function hasLayerPayload(layer?: WeatherLayerData): boolean {
  if (!layer) return false
  if (layer.renderMode === 'tile') return Boolean(layer.tileUrlTemplate)
  return (layer.vectorPoints?.length ?? 0) > 0
}

function formatCachedTime(value: string | null): string {
  if (!value) return 'unknown time'
  return new Date(value).toLocaleTimeString('en', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getRangeIso(windowHours: number): { from: string; to: string } {
  const now = Date.now()
  return {
    from: new Date(now - (windowHours * 60 * 60 * 1000)).toISOString(),
    to: new Date(now).toISOString(),
  }
}

export default function WeatherIntelligence() {
  const {
    selectedTime,
    availableTimes,
    activeLayers,
    layerOpacity,
    mapView,
    status,
    lastKnown,
    selectedStormId,
    setSelectedTime,
    setAvailableTimes,
    toggleLayer,
    setLayerOpacity,
    setMapView,
    setLayerLoading,
    setLayerStale,
    setLayerError,
    setLastKnownRadar,
    setLastKnownStorms,
    setLastKnownEnvLayer,
    setSelectedStormId,
  } = useWeatherStore()

  const [frames, setFrames] = useState<WeatherRadarFrame[]>([])
  const [stormCells, setStormCells] = useState<WeatherStormCell[]>([])
  const [layerData, setLayerData] = useState<Partial<Record<WeatherEnvLayerType, WeatherLayerData>>>({})
  const [mode, setMode] = useState<'live' | 'history'>('live')
  const [, setLiveTick] = useState(0)

  const requestBbox = useMemo(() => {
    return toBboxParam(mapView.bounds, mapView.center, mapView.zoom)
  }, [mapView.bounds, mapView.center, mapView.zoom])

  const refreshRadarFrames = useCallback(async () => {
    const { from, to } = getRangeIso(RADAR_WINDOW_HOURS)
    setLayerLoading('radar', true)
    setLayerError('radar', null)

    try {
      const response = await weatherDataService.getRadarFrames({
        from,
        to,
        stepMinutes: RADAR_STEP_MINUTES,
        bbox: requestBbox,
        zoom: mapView.zoom,
      })

      setFrames(response.frames)
      const nextTimes = response.frames.map((frame) => frame.timestamp)
      setAvailableTimes(nextTimes)
      const freshestFrame = response.frames[response.frames.length - 1]
      if (freshestFrame) {
        setLastKnownRadar(freshestFrame)
      }

      const currentSelected = useWeatherStore.getState().selectedTime
      const selectedStillValid = currentSelected && nextTimes.includes(currentSelected)
      const nextSelected = mode === 'live'
        ? nextTimes[nextTimes.length - 1] ?? null
        : selectedStillValid
          ? currentSelected
          : nextTimes[nextTimes.length - 1] ?? null
      setSelectedTime(nextSelected)
      setLayerStale('radar', response.frames[response.frames.length - 1]?.stale ?? false)
    } catch (error) {
      setLayerError('radar', error instanceof Error ? error.message : 'Failed to load radar frames')
    } finally {
      setLayerLoading('radar', false)
    }
  }, [mapView.zoom, mode, requestBbox, setAvailableTimes, setLastKnownRadar, setLayerError, setLayerLoading, setLayerStale, setSelectedTime])

  useEffect(() => {
    void refreshRadarFrames()
  }, [refreshRadarFrames])

  const refreshStormAndEnvLayers = useCallback(async (timeOverride?: string) => {
    const targetTime = timeOverride ?? selectedTime
    if (!targetTime) return

    setLayerLoading('storms', true)
    setLayerError('storms', null)
    try {
      const stormResponse = await weatherDataService.getStormCells({ time: targetTime, bbox: requestBbox })
      setStormCells(stormResponse.cells)
      if (stormResponse.cells.length > 0) {
        setLastKnownStorms(stormResponse.cells)
      }
      if (stormResponse.cells.length === 0) {
        setSelectedStormId(undefined)
      } else if (!selectedStormId || !stormResponse.cells.some((cell) => cell.id === selectedStormId)) {
        setSelectedStormId(stormResponse.cells[0].id)
      }
      setLayerStale('storms', stormResponse.cells.some((cell) => Boolean(cell.stale)))
    } catch (error) {
      setLayerError('storms', error instanceof Error ? error.message : 'Failed to load storm data')
    } finally {
      setLayerLoading('storms', false)
    }

    await Promise.all(ENV_TYPES.map(async (type) => {
      setLayerLoading(type, true)
      setLayerError(type, null)
      try {
        const nextData = await weatherDataService.getLayerData({ type, time: targetTime, bbox: requestBbox })
        setLayerData((current) => ({ ...current, [type]: nextData }))
        if (hasLayerPayload(nextData)) {
          setLastKnownEnvLayer(type, nextData)
        }
        setLayerStale(type, Boolean(nextData.stale))
      } catch (error) {
        setLayerError(type, error instanceof Error ? error.message : `Failed to load ${type} layer`)
      } finally {
        setLayerLoading(type, false)
      }
    }))
  }, [requestBbox, selectedStormId, selectedTime, setLastKnownEnvLayer, setLastKnownStorms, setLayerError, setLayerLoading, setLayerStale, setSelectedStormId])

  useEffect(() => {
    if (mode !== 'history') return undefined
    if (!selectedTime) return undefined

    const timer = window.setTimeout(() => {
      void refreshStormAndEnvLayers()
    }, TIMELINE_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [refreshStormAndEnvLayers, selectedTime])

  useEffect(() => {
    if (mode !== 'live') return undefined

    const poll = () => {
      const nowIso = new Date().toISOString()
      setLiveTick((current) => current + 1)
      void refreshRadarFrames()
      void refreshStormAndEnvLayers(nowIso)
    }

    poll()
    const timer = window.setInterval(poll, LIVE_REFRESH_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [mode, refreshRadarFrames, refreshStormAndEnvLayers])

  useEffect(() => {
    if (mode !== 'history') return
    if (!selectedTime || availableTimes.length < 2) return

    const currentIndex = availableTimes.findIndex((time) => time === selectedTime)
    if (currentIndex < 0) return

    const candidateIndexes = [currentIndex - 1, currentIndex + 1]
      .map((index) => (index + availableTimes.length) % availableTimes.length)
      .filter((value, index, list) => list.indexOf(value) === index)

    candidateIndexes.forEach((index) => {
      const time = availableTimes[index]
      void weatherDataService.getStormCells({ time, bbox: requestBbox })
      ENV_TYPES.forEach((type) => {
        void weatherDataService.getLayerData({ type, time, bbox: requestBbox })
      })
    })
  }, [availableTimes, mode, requestBbox, selectedTime])

  const selectedFrame = useMemo(() => {
    const current = frames.find((frame) => frame.timestamp === selectedTime)
      ?? frames[frames.length - 1]
    return current ?? lastKnown.radarFrame ?? undefined
  }, [frames, lastKnown.radarFrame, selectedTime])

  const effectiveStormCells = useMemo(() => {
    return stormCells.length > 0 ? stormCells : lastKnown.storms
  }, [lastKnown.storms, stormCells])

  const effectiveLayerData = useMemo(() => {
    const next: Partial<Record<WeatherEnvLayerType, WeatherLayerData>> = { ...layerData }
    ENV_TYPES.forEach((type) => {
      if (!hasLayerPayload(next[type])) {
        const fallback = lastKnown.envLayers[type]
        if (fallback) next[type] = fallback
      }
    })
    return next
  }, [lastKnown.envLayers, layerData])

  const selectedStorm = useMemo(() => (
    effectiveStormCells.find((storm) => storm.id === selectedStormId) ?? effectiveStormCells[0]
  ), [effectiveStormCells, selectedStormId])

  const activeLayerLoading = useMemo(() => {
    return status.loadingByLayer.radar
      || (activeLayers.storms && status.loadingByLayer.storms)
      || ENV_TYPES.some((type) => activeLayers[type] && status.loadingByLayer[type])
  }, [
    activeLayers,
    status.loadingByLayer.radar,
    status.loadingByLayer.storms,
    status.loadingByLayer.precipitation,
    status.loadingByLayer.wind,
    status.loadingByLayer.pressure,
    status.loadingByLayer.smoke,
  ])

  const envVisibility = useMemo(() => ({
    precipitation: activeLayers.precipitation,
    wind: activeLayers.wind,
    pressure: activeLayers.pressure,
    smoke: activeLayers.smoke,
  }), [activeLayers.precipitation, activeLayers.pressure, activeLayers.smoke, activeLayers.wind])

  const envOpacity = useMemo(() => ({
    precipitation: layerOpacity.precipitation,
    wind: layerOpacity.wind,
    pressure: layerOpacity.pressure,
    smoke: layerOpacity.smoke,
  }), [layerOpacity.precipitation, layerOpacity.pressure, layerOpacity.smoke, layerOpacity.wind])

  const stepTimeline = useCallback((direction: -1 | 1) => {
    if (availableTimes.length === 0) return
    const currentIndex = Math.max(0, availableTimes.findIndex((time) => time === selectedTime))
    const nextIndex = (currentIndex + direction + availableTimes.length) % availableTimes.length
    setSelectedTime(availableTimes[nextIndex])
  }, [availableTimes, selectedTime, setSelectedTime])

  const noDataMessage = useMemo(() => {
    if (activeLayerLoading) return null

    const enabledEnvTypes = ENV_TYPES.filter((type) => activeLayers[type])
    const envMissing = enabledEnvTypes.length > 0
      && enabledEnvTypes.every((type) => !hasLayerPayload(effectiveLayerData[type]))
    const radarMissing = activeLayers.radar && !selectedFrame
    const stormsMissing = activeLayers.storms && effectiveStormCells.length === 0

    if (radarMissing || stormsMissing || envMissing) {
      return 'No data available for one or more enabled layers at this timeline position.'
    }

    return null
  }, [activeLayerLoading, activeLayers, effectiveLayerData, effectiveStormCells.length, selectedFrame])

  const statusRows = useMemo(() => {
    const rows: Array<{ key: string; label: string; state: 'live' | 'loading' | 'delayed' | 'error' | 'fallback' }> = []

    const pushStatus = (key: string, label: string) => {
      const error = status.errorByLayer[key as keyof typeof status.errorByLayer]
      const loading = status.loadingByLayer[key as keyof typeof status.loadingByLayer]
      const stale = status.staleByLayer[key as keyof typeof status.staleByLayer]
      const fallback = key === 'radar'
        ? (
          mode === 'history'
            ? !frames.some((frame) => frame.timestamp === selectedTime)
            : frames.length === 0
        ) && Boolean(lastKnown.radarFrame)
        : key === 'storms'
          ? stormCells.length === 0 && lastKnown.storms.length > 0
          : !hasLayerPayload(layerData[key as WeatherEnvLayerType]) && hasLayerPayload(lastKnown.envLayers[key as WeatherEnvLayerType])

      rows.push({
        key,
        label,
        state: error ? 'error' : loading ? 'loading' : fallback ? 'fallback' : stale ? 'delayed' : 'live',
      })
    }

    pushStatus('radar', 'Radar')
    if (activeLayers.storms) pushStatus('storms', 'Storms')
    ENV_TYPES.filter((type) => activeLayers[type]).forEach((type) => pushStatus(type, toTitle(type)))
    return rows
  }, [activeLayers, frames, lastKnown.envLayers, lastKnown.radarFrame, lastKnown.storms.length, layerData, mode, selectedTime, status.errorByLayer, status.loadingByLayer, status.staleByLayer, stormCells.length])

  const fallbackNotices = useMemo(() => {
    const notices: string[] = []

    const radarNeedsFallback = mode === 'history'
      ? !frames.some((frame) => frame.timestamp === selectedTime)
      : frames.length === 0

    if (activeLayers.radar && radarNeedsFallback && lastKnown.radarFrame) {
      notices.push(`Radar fallback: using cached frame from ${formatCachedTime(lastKnown.updatedAtByLayer.radar)}.`)
    }
    if (activeLayers.storms && stormCells.length === 0 && lastKnown.storms.length > 0) {
      notices.push(`Storm fallback: using cached cells from ${formatCachedTime(lastKnown.updatedAtByLayer.storms)}.`)
    }
    ENV_TYPES.filter((type) => activeLayers[type]).forEach((type) => {
      const hasCurrent = hasLayerPayload(layerData[type])
      const hasCached = hasLayerPayload(lastKnown.envLayers[type])
      if (!hasCurrent && hasCached) {
        notices.push(`${toTitle(type)} fallback: using cached layer from ${formatCachedTime(lastKnown.updatedAtByLayer[type])}.`)
      }
    })

    return notices
  }, [activeLayers, frames, lastKnown, layerData, mode, selectedTime, stormCells.length])

  return (
    <div className="oct-screen space-y-3 md:space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_42%),linear-gradient(180deg,_rgba(10,16,28,0.96),_rgba(4,8,15,0.98))] p-4 md:p-5 overflow-hidden relative shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-[var(--accent)]">
            <CloudRain size={12} /> WEATHER INTELLIGENCE
          </div>
          <h2 className="mt-2 text-2xl md:text-4xl font-black leading-tight tracking-tight">Live Radar Timeline</h2>
          <p className="mt-2 max-w-3xl text-sm md:text-[13px] text-[var(--muted)] leading-6">
            Phase 1 baseline includes real-time radar frame playback, timeline scrubbing, and weather-layer scaffolding.
          </p>
        </div>
      </div>

      <Panel title="Radar Map" subtitle={mode === 'live' ? 'Live feed (10s refresh)' : 'Historical scrub (24h)'} className="h-full">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => toggleLayer('radar')}
                className="weather-control-btn"
              >
                {activeLayers.radar ? 'Hide Radar' : 'Show Radar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void refreshRadarFrames()
                  void refreshStormAndEnvLayers()
                }}
                className="weather-control-btn"
              >
                <span className="inline-flex items-center gap-1"><RefreshCcw size={12} /> Refresh</span>
              </button>
              <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
                Radar Opacity
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(layerOpacity.radar * 100)}
                  onChange={(event) => setLayerOpacity('radar', Number(event.target.value) / 100)}
                  className="accent-[var(--accent)]"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {statusRows.map((row) => (
                <span
                  key={row.key}
                  data-testid={`weather-status-${row.key}`}
                  className={`weather-status-pill weather-status-pill--${row.state}`}
                >
                  {row.label}: {row.state}
                </span>
              ))}
            </div>

            {fallbackNotices.length > 0 ? (
              <div className="weather-fallback-notes" data-testid="weather-fallback-notes">
                {fallbackNotices.map((note) => (
                  <div key={note} className="weather-fallback-note" data-testid="weather-fallback-note">{note}</div>
                ))}
              </div>
            ) : null}

            {status.errorByLayer.radar ? (
              <div className="rounded border border-red-400/35 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
                {status.errorByLayer.radar}
              </div>
            ) : null}

            <TimeScrubber
              times={availableTimes}
              selectedTime={selectedTime}
              mode={mode}
              onTimeChange={setSelectedTime}
              onStep={stepTimeline}
              onModeChange={(nextMode) => {
                setMode(nextMode)
                if (nextMode === 'live') {
                  setSelectedTime(availableTimes[availableTimes.length - 1] ?? new Date().toISOString())
                  setLiveTick((current) => current + 1)
                }
              }}
              onJumpToLive={() => {
                setMode('live')
                setSelectedTime(availableTimes[availableTimes.length - 1] ?? new Date().toISOString())
                setLiveTick((current) => current + 1)
              }}
            />

            <WeatherMapContainer
              mapView={mapView}
              frame={selectedFrame}
              stormCells={effectiveStormCells}
              selectedStormId={selectedStorm?.id}
              envLayers={effectiveLayerData}
              stormsVisible={activeLayers.storms}
              envVisibility={envVisibility}
              envOpacity={envOpacity}
              radarVisible={activeLayers.radar}
              radarOpacity={layerOpacity.radar}
              loading={activeLayerLoading}
              noDataMessage={noDataMessage}
              onStormSelect={setSelectedStormId}
              onMapViewChange={(center, zoom, bounds) => setMapView({ center, zoom, bounds })}
            />
          </div>

          <div className="flex flex-col gap-3">
            <LayerControlPanel
              activeLayers={{
                storms: activeLayers.storms,
                precipitation: activeLayers.precipitation,
                wind: activeLayers.wind,
                pressure: activeLayers.pressure,
                smoke: activeLayers.smoke,
              }}
              layerOpacity={{
                precipitation: layerOpacity.precipitation,
                wind: layerOpacity.wind,
                pressure: layerOpacity.pressure,
                smoke: layerOpacity.smoke,
              }}
              onToggleLayer={toggleLayer}
              onOpacityChange={setLayerOpacity}
            />
            <StormLayer selectedStorm={selectedStorm} />
            <EnvLayer dataByLayer={effectiveLayerData} active={envVisibility} />
          </div>
        </div>
      </Panel>
    </div>
  )
}
