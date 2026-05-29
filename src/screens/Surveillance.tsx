import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Radar, RefreshCcw, Server } from 'lucide-react'
import { SurveillanceMap } from '@/components/surveillance/SurveillanceMap'
import { createPollingIntelTransport, getIntelBridgeRuntime, type IntelFocusMode } from '@/modules/surveillance/intel'
import { runFusionCycle } from '@/modules/fusion'
import { useFusedEventStore } from '@/modules/fusion/event-store'
import { emitTelemetryEvent, type TelemetrySample } from '@/modules/visualization/telemetry'
import type { VisualizationAlert, VisualizationGeoOverlay, VisualizationNode, VisualizationSubsystem, VisualizationTrafficSegment } from '@/modules/visualization/types'
import { useSurveillanceIntelStore } from '@/state/surveillance-intel'
import { Panel } from '@components/primitives/Panel'
import { MetricCard } from '@components/primitives/MetricCard'
import { StatusBadge } from '@components/primitives/StatusBadge'

type AudioBands = {
  subBass: number
  bass: number
  lowMid: number
  mid: number
  presence: number
  treble: number
  brilliance: number
  flux: number
  transient: number
  centroid: number
  pulse: number
  beat: number
}

type AudioInputMode = 'auto' | 'system' | 'microphone' | 'file'

type AudioRuntime = {
  context?: AudioContext
  analyser?: AnalyserNode
  source?: MediaStreamAudioSourceNode | MediaElementAudioSourceNode
  stream?: MediaStream
  mediaElement?: HTMLAudioElement
  mediaObjectUrl?: string
  raf?: number
}

type SharedAudioFrame = {
  sourceId: string
  timestamp: number
  status: string
  level: number
  bands: AudioBands
}

const AUDIO_SHARE_CHANNEL = 'octane-audio-reactive-v1'
const REMOTE_AUDIO_TIMEOUT_MS = 2_500
const TRAFFIC_REFRESH_MS = 45_000
const EMPTY_AUDIO_BANDS: AudioBands = {
  subBass: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  presence: 0,
  treble: 0,
  brilliance: 0,
  flux: 0,
  transient: 0,
  centroid: 0,
  pulse: 0,
  beat: 0,
}

type GlobalEventCategory = 'traffic' | 'weather' | 'wildfire' | 'police' | 'service'

type SurveillanceAlertFeed = {
  id: string
  type: string
  severity: VisualizationAlert['severity']
  title: string
  description: string
  probability?: number
  confidence?: number
  serverId?: string
  timestamp: number
  resolved: boolean
  resolvedAt?: number
}

type TrafficIncidentPayload = {
  id: string
  type: string
  severity: VisualizationAlert['severity']
  title: string
  description: string
  lat: number
  lng: number
  roadClass: 'highway' | 'arterial' | 'collector'
  source: string
  updatedAt: string
  stale: boolean
}

type TrafficFlowResponse = {
  ok?: boolean
  data?: {
    provider?: string
    stale?: boolean
    updatedAt?: string
    segments?: VisualizationTrafficSegment[]
  }
}

type TrafficIncidentResponse = {
  ok?: boolean
  data?: {
    provider?: string
    stale?: boolean
    updatedAt?: string
    incidents?: TrafficIncidentPayload[]
  }
}

type TrafficRoadClass = VisualizationTrafficSegment['roadClass']
type BasemapMode = 'satellite' | 'traffic'
type HealthNodeTier = 'town' | 'city' | 'metropolis'

type HealthNodeLocation = {
  id: string
  name: string
  country: string
  tier: HealthNodeTier
  lat: number
  lng: number
  repairRadiusKm: number
}

type ActiveHealthNode = HealthNodeLocation & {
  mission: string
  activeSince: number
}

type HealthNodesApiResponse = {
  success?: boolean
  data?: {
    capabilityMode?: string
    activeNodes?: ActiveHealthNode[]
    playbooks?: Array<{ id: string; title: string }>
    recentOperations?: Array<{
      id: string
      status: string
      nodeName: string
      playbookTitle: string
      createdAt: number
      completedAt?: number
    }>
  }
}

type HealthPlaybook = { id: string; title: string }
type HealthOperation = {
  id: string
  status: string
  nodeName: string
  playbookTitle: string
  createdAt: number
  completedAt?: number
}

const FALLBACK_NODES: VisualizationNode[] = [
  { id: 'edge-na', name: 'EDGE NA', country: 'United States', region: 'North America', lat: 39.8, lng: -98.6, status: 'NOMINAL', latencyMs: 36, loadPercent: 48, requestsPerMin: 22400, connections: ['edge-eu', 'edge-apac'] },
  { id: 'edge-eu', name: 'EDGE EU', country: 'Germany', region: 'Europe', lat: 51.2, lng: 10.4, status: 'NOMINAL', latencyMs: 54, loadPercent: 42, requestsPerMin: 19700, connections: ['edge-na', 'edge-apac'] },
  { id: 'edge-apac', name: 'EDGE APAC', country: 'Singapore', region: 'Asia Pacific', lat: 1.3, lng: 103.8, status: 'DEGRADED', latencyMs: 112, loadPercent: 76, requestsPerMin: 15100, connections: ['edge-na', 'edge-eu'] },
]

const FEED_TIMELINE_LIMIT = 96
const STALE_THRESHOLD_MS = 24_000
const HEALTH_NODE_ROTATION_MS = 14_000
const ACTIVE_HEALTH_NODE_COUNT = 9
const HEALTH_NODE_TIER_ORDER: HealthNodeTier[] = ['metropolis', 'city', 'town']
const HEALTH_NODE_PER_TIER: Record<HealthNodeTier, number> = { metropolis: 4, city: 3, town: 2 }

const HEALTH_NODE_LOCATIONS: HealthNodeLocation[] = [
  { id: 'hn-town-reykjavik', name: 'Reykjavik', country: 'Iceland', tier: 'town', lat: 64.1466, lng: -21.9426, repairRadiusKm: 220 },
  { id: 'hn-town-bergen', name: 'Bergen', country: 'Norway', tier: 'town', lat: 60.3913, lng: 5.3221, repairRadiusKm: 260 },
  { id: 'hn-town-curitiba', name: 'Curitiba', country: 'Brazil', tier: 'town', lat: -25.429, lng: -49.2671, repairRadiusKm: 300 },
  { id: 'hn-town-port-louis', name: 'Port Louis', country: 'Mauritius', tier: 'town', lat: -20.1609, lng: 57.5012, repairRadiusKm: 180 },
  { id: 'hn-town-faro', name: 'Faro', country: 'Portugal', tier: 'town', lat: 37.0194, lng: -7.9322, repairRadiusKm: 210 },
  { id: 'hn-town-hobart', name: 'Hobart', country: 'Australia', tier: 'town', lat: -42.8821, lng: 147.3272, repairRadiusKm: 260 },
  { id: 'hn-town-ushuaia', name: 'Ushuaia', country: 'Argentina', tier: 'town', lat: -54.8019, lng: -68.303, repairRadiusKm: 240 },
  { id: 'hn-town-galway', name: 'Galway', country: 'Ireland', tier: 'town', lat: 53.2707, lng: -9.0568, repairRadiusKm: 220 },
  { id: 'hn-town-queenstown', name: 'Queenstown', country: 'New Zealand', tier: 'town', lat: -45.0312, lng: 168.6626, repairRadiusKm: 250 },
  { id: 'hn-town-nuuk', name: 'Nuuk', country: 'Greenland', tier: 'town', lat: 64.1814, lng: -51.6941, repairRadiusKm: 280 },
  { id: 'hn-town-tromso', name: 'Tromso', country: 'Norway', tier: 'town', lat: 69.6492, lng: 18.9553, repairRadiusKm: 300 },
  { id: 'hn-town-victoria-falls', name: 'Victoria Falls', country: 'Zimbabwe', tier: 'town', lat: -17.9243, lng: 25.8572, repairRadiusKm: 210 },
  { id: 'hn-town-san-miguel', name: 'San Miguel de Allende', country: 'Mexico', tier: 'town', lat: 20.9144, lng: -100.7436, repairRadiusKm: 230 },
  { id: 'hn-town-banff', name: 'Banff', country: 'Canada', tier: 'town', lat: 51.1784, lng: -115.5708, repairRadiusKm: 240 },
  { id: 'hn-town-bozeman', name: 'Bozeman', country: 'United States', tier: 'town', lat: 45.677, lng: -111.0429, repairRadiusKm: 230 },
  { id: 'hn-town-asheville', name: 'Asheville', country: 'United States', tier: 'town', lat: 35.5951, lng: -82.5515, repairRadiusKm: 220 },
  { id: 'hn-town-bend', name: 'Bend', country: 'United States', tier: 'town', lat: 44.0582, lng: -121.3153, repairRadiusKm: 220 },
  { id: 'hn-town-santa-fe', name: 'Santa Fe', country: 'United States', tier: 'town', lat: 35.687, lng: -105.9378, repairRadiusKm: 230 },
  { id: 'hn-town-burlington-vt', name: 'Burlington', country: 'United States', tier: 'town', lat: 44.4759, lng: -73.2121, repairRadiusKm: 210 },
  { id: 'hn-town-sucre', name: 'Sucre', country: 'Bolivia', tier: 'town', lat: -19.0196, lng: -65.2619, repairRadiusKm: 220 },
  { id: 'hn-town-invercargill', name: 'Invercargill', country: 'New Zealand', tier: 'town', lat: -46.4132, lng: 168.3538, repairRadiusKm: 240 },
  { id: 'hn-town-kangerlussuaq', name: 'Kangerlussuaq', country: 'Greenland', tier: 'town', lat: 67.0122, lng: -50.7116, repairRadiusKm: 260 },
  { id: 'hn-city-anchorage', name: 'Anchorage', country: 'United States', tier: 'city', lat: 61.2181, lng: -149.9003, repairRadiusKm: 520 },
  { id: 'hn-city-toronto', name: 'Toronto', country: 'Canada', tier: 'city', lat: 43.6532, lng: -79.3832, repairRadiusKm: 680 },
  { id: 'hn-city-madrid', name: 'Madrid', country: 'Spain', tier: 'city', lat: 40.4168, lng: -3.7038, repairRadiusKm: 710 },
  { id: 'hn-city-nairobi', name: 'Nairobi', country: 'Kenya', tier: 'city', lat: -1.2921, lng: 36.8219, repairRadiusKm: 640 },
  { id: 'hn-city-lima', name: 'Lima', country: 'Peru', tier: 'city', lat: -12.0464, lng: -77.0428, repairRadiusKm: 690 },
  { id: 'hn-city-auckland', name: 'Auckland', country: 'New Zealand', tier: 'city', lat: -36.8485, lng: 174.7633, repairRadiusKm: 670 },
  { id: 'hn-city-vancouver', name: 'Vancouver', country: 'Canada', tier: 'city', lat: 49.2827, lng: -123.1207, repairRadiusKm: 700 },
  { id: 'hn-city-casablanca', name: 'Casablanca', country: 'Morocco', tier: 'city', lat: 33.5731, lng: -7.5898, repairRadiusKm: 660 },
  { id: 'hn-city-santiago', name: 'Santiago', country: 'Chile', tier: 'city', lat: -33.4489, lng: -70.6693, repairRadiusKm: 710 },
  { id: 'hn-city-helsinki', name: 'Helsinki', country: 'Finland', tier: 'city', lat: 60.1699, lng: 24.9384, repairRadiusKm: 630 },
  { id: 'hn-city-kuala-lumpur', name: 'Kuala Lumpur', country: 'Malaysia', tier: 'city', lat: 3.139, lng: 101.6869, repairRadiusKm: 740 },
  { id: 'hn-city-johannesburg', name: 'Johannesburg', country: 'South Africa', tier: 'city', lat: -26.2041, lng: 28.0473, repairRadiusKm: 760 },
  { id: 'hn-city-istanbul', name: 'Istanbul', country: 'Turkey', tier: 'city', lat: 41.0082, lng: 28.9784, repairRadiusKm: 780 },
  { id: 'hn-city-osaka', name: 'Osaka', country: 'Japan', tier: 'city', lat: 34.6937, lng: 135.5023, repairRadiusKm: 720 },
  { id: 'hn-city-bogota', name: 'Bogota', country: 'Colombia', tier: 'city', lat: 4.711, lng: -74.0721, repairRadiusKm: 700 },
  { id: 'hn-city-rome', name: 'Rome', country: 'Italy', tier: 'city', lat: 41.9028, lng: 12.4964, repairRadiusKm: 670 },
  { id: 'hn-city-taipei', name: 'Taipei', country: 'Taiwan', tier: 'city', lat: 25.033, lng: 121.5654, repairRadiusKm: 690 },
  { id: 'hn-city-doha', name: 'Doha', country: 'Qatar', tier: 'city', lat: 25.2854, lng: 51.531, repairRadiusKm: 650 },
  { id: 'hn-city-phoenix', name: 'Phoenix', country: 'United States', tier: 'city', lat: 33.4484, lng: -112.074, repairRadiusKm: 700 },
  { id: 'hn-city-denver', name: 'Denver', country: 'United States', tier: 'city', lat: 39.7392, lng: -104.9903, repairRadiusKm: 710 },
  { id: 'hn-city-san-diego', name: 'San Diego', country: 'United States', tier: 'city', lat: 32.7157, lng: -117.1611, repairRadiusKm: 690 },
  { id: 'hn-city-charlotte', name: 'Charlotte', country: 'United States', tier: 'city', lat: 35.2271, lng: -80.8431, repairRadiusKm: 680 },
  { id: 'hn-city-orlando', name: 'Orlando', country: 'United States', tier: 'city', lat: 28.5383, lng: -81.3792, repairRadiusKm: 670 },
  { id: 'hn-city-detroit', name: 'Detroit', country: 'United States', tier: 'city', lat: 42.3314, lng: -83.0458, repairRadiusKm: 700 },
  { id: 'hn-city-minneapolis', name: 'Minneapolis', country: 'United States', tier: 'city', lat: 44.9778, lng: -93.265, repairRadiusKm: 710 },
  { id: 'hn-city-kansas-city', name: 'Kansas City', country: 'United States', tier: 'city', lat: 39.0997, lng: -94.5786, repairRadiusKm: 700 },
  { id: 'hn-city-accra', name: 'Accra', country: 'Ghana', tier: 'city', lat: 5.6037, lng: -0.187, repairRadiusKm: 660 },
  { id: 'hn-city-addis-ababa', name: 'Addis Ababa', country: 'Ethiopia', tier: 'city', lat: 8.9806, lng: 38.7578, repairRadiusKm: 680 },
  { id: 'hn-city-almaty', name: 'Almaty', country: 'Kazakhstan', tier: 'city', lat: 43.222, lng: 76.8512, repairRadiusKm: 720 },
  { id: 'hn-city-honolulu', name: 'Honolulu', country: 'United States', tier: 'city', lat: 21.3069, lng: -157.8583, repairRadiusKm: 740 },
  { id: 'hn-metro-new-york', name: 'New York', country: 'United States', tier: 'metropolis', lat: 40.7128, lng: -74.006, repairRadiusKm: 1200 },
  { id: 'hn-metro-los-angeles', name: 'Los Angeles', country: 'United States', tier: 'metropolis', lat: 34.0522, lng: -118.2437, repairRadiusKm: 1180 },
  { id: 'hn-metro-mexico-city', name: 'Mexico City', country: 'Mexico', tier: 'metropolis', lat: 19.4326, lng: -99.1332, repairRadiusKm: 1050 },
  { id: 'hn-metro-sao-paulo', name: 'Sao Paulo', country: 'Brazil', tier: 'metropolis', lat: -23.5558, lng: -46.6396, repairRadiusKm: 1220 },
  { id: 'hn-metro-london', name: 'London', country: 'United Kingdom', tier: 'metropolis', lat: 51.5074, lng: -0.1278, repairRadiusKm: 1140 },
  { id: 'hn-metro-paris', name: 'Paris', country: 'France', tier: 'metropolis', lat: 48.8566, lng: 2.3522, repairRadiusKm: 1160 },
  { id: 'hn-metro-lagos', name: 'Lagos', country: 'Nigeria', tier: 'metropolis', lat: 6.5244, lng: 3.3792, repairRadiusKm: 1040 },
  { id: 'hn-metro-cairo', name: 'Cairo', country: 'Egypt', tier: 'metropolis', lat: 30.0444, lng: 31.2357, repairRadiusKm: 1010 },
  { id: 'hn-metro-mumbai', name: 'Mumbai', country: 'India', tier: 'metropolis', lat: 19.076, lng: 72.8777, repairRadiusKm: 1240 },
  { id: 'hn-metro-delhi', name: 'Delhi', country: 'India', tier: 'metropolis', lat: 28.6139, lng: 77.209, repairRadiusKm: 1260 },
  { id: 'hn-metro-bangkok', name: 'Bangkok', country: 'Thailand', tier: 'metropolis', lat: 13.7563, lng: 100.5018, repairRadiusKm: 1090 },
  { id: 'hn-metro-tokyo', name: 'Tokyo', country: 'Japan', tier: 'metropolis', lat: 35.6762, lng: 139.6503, repairRadiusKm: 1280 },
  { id: 'hn-metro-seoul', name: 'Seoul', country: 'South Korea', tier: 'metropolis', lat: 37.5665, lng: 126.978, repairRadiusKm: 1100 },
  { id: 'hn-metro-shanghai', name: 'Shanghai', country: 'China', tier: 'metropolis', lat: 31.2304, lng: 121.4737, repairRadiusKm: 1270 },
  { id: 'hn-metro-jakarta', name: 'Jakarta', country: 'Indonesia', tier: 'metropolis', lat: -6.2088, lng: 106.8456, repairRadiusKm: 1110 },
  { id: 'hn-metro-sydney', name: 'Sydney', country: 'Australia', tier: 'metropolis', lat: -33.8688, lng: 151.2093, repairRadiusKm: 1190 },
  { id: 'hn-metro-san-francisco', name: 'San Francisco', country: 'United States', tier: 'metropolis', lat: 37.7749, lng: -122.4194, repairRadiusKm: 1130 },
  { id: 'hn-metro-chicago', name: 'Chicago', country: 'United States', tier: 'metropolis', lat: 41.8781, lng: -87.6298, repairRadiusKm: 1170 },
  { id: 'hn-metro-atlanta', name: 'Atlanta', country: 'United States', tier: 'metropolis', lat: 33.749, lng: -84.388, repairRadiusKm: 1090 },
  { id: 'hn-metro-buenos-aires', name: 'Buenos Aires', country: 'Argentina', tier: 'metropolis', lat: -34.6037, lng: -58.3816, repairRadiusKm: 1180 },
  { id: 'hn-metro-rio-de-janeiro', name: 'Rio de Janeiro', country: 'Brazil', tier: 'metropolis', lat: -22.9068, lng: -43.1729, repairRadiusKm: 1160 },
  { id: 'hn-metro-amsterdam', name: 'Amsterdam', country: 'Netherlands', tier: 'metropolis', lat: 52.3676, lng: 4.9041, repairRadiusKm: 1080 },
  { id: 'hn-metro-berlin', name: 'Berlin', country: 'Germany', tier: 'metropolis', lat: 52.52, lng: 13.405, repairRadiusKm: 1100 },
  { id: 'hn-metro-milan', name: 'Milan', country: 'Italy', tier: 'metropolis', lat: 45.4642, lng: 9.19, repairRadiusKm: 1070 },
  { id: 'hn-metro-istanbul-metro', name: 'Istanbul Metro', country: 'Turkey', tier: 'metropolis', lat: 41.0151, lng: 28.9795, repairRadiusKm: 1120 },
  { id: 'hn-metro-dubai', name: 'Dubai', country: 'United Arab Emirates', tier: 'metropolis', lat: 25.2048, lng: 55.2708, repairRadiusKm: 1150 },
  { id: 'hn-metro-riyadh', name: 'Riyadh', country: 'Saudi Arabia', tier: 'metropolis', lat: 24.7136, lng: 46.6753, repairRadiusKm: 1110 },
  { id: 'hn-metro-tehran', name: 'Tehran', country: 'Iran', tier: 'metropolis', lat: 35.6892, lng: 51.389, repairRadiusKm: 1140 },
  { id: 'hn-metro-karachi', name: 'Karachi', country: 'Pakistan', tier: 'metropolis', lat: 24.8607, lng: 67.0011, repairRadiusKm: 1210 },
  { id: 'hn-metro-dhaka', name: 'Dhaka', country: 'Bangladesh', tier: 'metropolis', lat: 23.8103, lng: 90.4125, repairRadiusKm: 1200 },
  { id: 'hn-metro-manila', name: 'Manila', country: 'Philippines', tier: 'metropolis', lat: 14.5995, lng: 120.9842, repairRadiusKm: 1170 },
  { id: 'hn-metro-ho-chi-minh-city', name: 'Ho Chi Minh City', country: 'Vietnam', tier: 'metropolis', lat: 10.8231, lng: 106.6297, repairRadiusKm: 1160 },
  { id: 'hn-metro-hong-kong', name: 'Hong Kong', country: 'China', tier: 'metropolis', lat: 22.3193, lng: 114.1694, repairRadiusKm: 1090 },
  { id: 'hn-metro-beijing', name: 'Beijing', country: 'China', tier: 'metropolis', lat: 39.9042, lng: 116.4074, repairRadiusKm: 1290 },
  { id: 'hn-metro-singapore', name: 'Singapore', country: 'Singapore', tier: 'metropolis', lat: 1.3521, lng: 103.8198, repairRadiusKm: 1080 },
  { id: 'hn-metro-melbourne', name: 'Melbourne', country: 'Australia', tier: 'metropolis', lat: -37.8136, lng: 144.9631, repairRadiusKm: 1180 },
  { id: 'hn-metro-perth', name: 'Perth', country: 'Australia', tier: 'metropolis', lat: -31.9505, lng: 115.8605, repairRadiusKm: 1140 },
  { id: 'hn-metro-auckland-metro', name: 'Auckland Metro', country: 'New Zealand', tier: 'metropolis', lat: -36.8509, lng: 174.7645, repairRadiusKm: 1110 },
  { id: 'hn-metro-johannesburg-metro', name: 'Johannesburg Metro', country: 'South Africa', tier: 'metropolis', lat: -26.2041, lng: 28.0473, repairRadiusKm: 1120 },
  { id: 'hn-metro-nairobi-metro', name: 'Nairobi Metro', country: 'Kenya', tier: 'metropolis', lat: -1.2864, lng: 36.8172, repairRadiusKm: 1040 },
  { id: 'hn-metro-lima-metro', name: 'Lima Metro', country: 'Peru', tier: 'metropolis', lat: -12.0464, lng: -77.0428, repairRadiusKm: 1120 },
  { id: 'hn-metro-reykjavik-metro', name: 'Reykjavik Metro', country: 'Iceland', tier: 'metropolis', lat: 64.1466, lng: -21.9426, repairRadiusKm: 1020 },
  { id: 'hn-metro-hanoi-metro', name: 'Hanoi Metro', country: 'Vietnam', tier: 'metropolis', lat: 21.0278, lng: 105.8342, repairRadiusKm: 1110 },
  { id: 'hn-metro-hong-kong-metro', name: 'Hong Kong Metro', country: 'China', tier: 'metropolis', lat: 22.3193, lng: 114.1694, repairRadiusKm: 1100 },
  { id: 'hn-metro-philadelphia', name: 'Philadelphia', country: 'United States', tier: 'metropolis', lat: 39.9526, lng: -75.1652, repairRadiusKm: 1110 },
  { id: 'hn-metro-houston', name: 'Houston', country: 'United States', tier: 'metropolis', lat: 29.7604, lng: -95.3698, repairRadiusKm: 1160 },
  { id: 'hn-metro-dallas', name: 'Dallas Metro', country: 'United States', tier: 'metropolis', lat: 32.7767, lng: -96.797, repairRadiusKm: 1140 },
  { id: 'hn-metro-miami', name: 'Miami Metro', country: 'United States', tier: 'metropolis', lat: 25.7617, lng: -80.1918, repairRadiusKm: 1090 },
  { id: 'hn-metro-seattle', name: 'Seattle Metro', country: 'United States', tier: 'metropolis', lat: 47.6062, lng: -122.3321, repairRadiusKm: 1130 },
  { id: 'hn-metro-boston', name: 'Boston Metro', country: 'United States', tier: 'metropolis', lat: 42.3601, lng: -71.0589, repairRadiusKm: 1080 },
  { id: 'hn-metro-washington-dc', name: 'Washington DC Metro', country: 'United States', tier: 'metropolis', lat: 38.9072, lng: -77.0369, repairRadiusKm: 1080 },
  { id: 'hn-metro-las-vegas', name: 'Las Vegas Metro', country: 'United States', tier: 'metropolis', lat: 36.1699, lng: -115.1398, repairRadiusKm: 1090 },
]

function normalizeAlertCategory(rawType: string): GlobalEventCategory {
  const value = rawType.trim().toLowerCase()
  if (value.includes('wildfire') || value.includes('wild fire') || value.includes('brush fire') || value.includes('forest fire') || value.includes('fire')) return 'wildfire'
  if (value.includes('weather') || value.includes('storm') || value.includes('flood') || value.includes('wind')) return 'weather'
  if (value.includes('police') || value.includes('law') || value.includes('crime') || value.includes('security')) return 'police'
  if (value.includes('service') || value.includes('closure') || value.includes('utility') || value.includes('maintenance') || value.includes('outage')) return 'service'
  return 'traffic'
}

function mapStatus(status: string): VisualizationNode['status'] {
  const value = status.toLowerCase()
  if (value.includes('offline') || value.includes('critical')) return 'OFFLINE'
  if (value.includes('degraded') || value.includes('warn')) return 'DEGRADED'
  return 'NOMINAL'
}

function formatAgo(timestamp: number, now: number): string {
  const minutes = Math.max(1, Math.round((now - timestamp) / 60_000))
  return minutes === 1 ? '1 min ago' : `${minutes} mins ago`
}

function isSyntheticLikeSource(source: string | undefined): boolean {
  const value = (source ?? '').toLowerCase()
  if (!value) return true
  return (
    value.includes('synthetic')
    || value.includes('simulated')
    || value.includes('simulation')
    || value.includes('mock')
    || value.includes('test')
    || value.includes('demo')
    || value.includes('fallback')
  )
}

function hasTrustedRealEvidence(alert: VisualizationAlert): boolean {
  if (!Array.isArray(alert.realWorldEvidence) || alert.realWorldEvidence.length === 0) return false
  return alert.realWorldEvidence.some((evidence) => {
    if (isSyntheticLikeSource(evidence.source)) return false
    return (evidence.quality ?? 0.5) >= 0.5
  })
}

function estimateTrafficBounds(center: { lat: number; lng: number }, altitude: number): string {
  const zoomFactor = Math.max(0.18, (100 - altitude) / 100)
  const latSpan = 0.9 + (zoomFactor * 3.8)
  const lngSpan = 1.3 + (zoomFactor * 5.4)
  const west = center.lng - lngSpan
  const south = center.lat - latSpan
  const east = center.lng + lngSpan
  const north = center.lat + latSpan
  return `${west.toFixed(4)},${south.toFixed(4)},${east.toFixed(4)},${north.toFixed(4)}`
}

function simplifyTrafficPolyline(polyline: Array<[number, number]>): Array<[number, number]> {
  if (polyline.length <= 40) return polyline
  const stride = Math.max(2, Math.ceil(polyline.length / 32))
  return polyline.filter((_, index) => index === 0 || index === polyline.length - 1 || (index % stride) === 0)
}

function roadPriority(roadClass: TrafficRoadClass): number {
  if (roadClass === 'highway') return 3
  if (roadClass === 'arterial') return 2
  return 1
}

function dedupeTrafficSegments(segments: VisualizationTrafficSegment[]): VisualizationTrafficSegment[] {
  const seen = new Set<string>()
  return segments.filter((segment) => {
    const key = `${segment.roadClass}:${segment.centroid.lat.toFixed(3)}:${segment.centroid.lng.toFixed(3)}:${segment.currentSpeedKph}:${segment.freeFlowSpeedKph}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function curateTrafficSegments(segments: VisualizationTrafficSegment[], altitude: number, basemapMode: BasemapMode): VisualizationTrafficSegment[] {
  const deduped = dedupeTrafficSegments(segments)
    .map((segment) => ({
      ...segment,
      polyline: simplifyTrafficPolyline(segment.polyline),
    }))
    .filter((segment) => segment.polyline.length >= 2)

  const ranked = [...deduped].sort((left, right) => {
    const roadDelta = roadPriority(right.roadClass) - roadPriority(left.roadClass)
    if (roadDelta !== 0) return roadDelta
    const congestionDelta = right.congestionIndex - left.congestionIndex
    if (Math.abs(congestionDelta) > 0.02) return congestionDelta
    return right.confidence - left.confidence
  })

  const zoomFactor = Math.max(0.18, (100 - altitude) / 100)
  const trafficMode = basemapMode === 'traffic'
  const budgets: Record<TrafficRoadClass, number> = {
    highway: Math.round((trafficMode ? 120 : 72) + (zoomFactor * (trafficMode ? 150 : 96))),
    arterial: Math.round((trafficMode ? 96 : 56) + (zoomFactor * (trafficMode ? 132 : 88))),
    collector: Math.round((trafficMode ? 48 : 18) + (zoomFactor * (trafficMode ? 76 : 40))),
  }
  const counts: Record<TrafficRoadClass, number> = {
    highway: 0,
    arterial: 0,
    collector: 0,
  }

  const curated: VisualizationTrafficSegment[] = []
  ranked.forEach((segment) => {
    if (segment.congestionIndex >= (trafficMode ? 0.18 : 0.4)) {
      curated.push(segment)
      counts[segment.roadClass] += 1
      return
    }
    if (counts[segment.roadClass] >= budgets[segment.roadClass]) return
    counts[segment.roadClass] += 1
    curated.push(segment)
  })

  return curated
}

function congestionTone(congestionIndex: number): 'clear' | 'moderate' | 'heavy' | 'severe' {
  if (congestionIndex >= 0.76) return 'severe'
  if (congestionIndex >= 0.51) return 'heavy'
  if (congestionIndex >= 0.26) return 'moderate'
  return 'clear'
}

function toTrafficAlerts(incidents: TrafficIncidentPayload[]): VisualizationAlert[] {
  return incidents
    .filter((incident) => !isSyntheticLikeSource(incident.source))
    .map((incident) => ({
    id: incident.id,
    type: incident.type,
    severity: incident.severity,
    title: incident.title,
    description: incident.description,
    timestamp: new Date(incident.updatedAt).getTime(),
    lat: incident.lat,
    lng: incident.lng,
    resolved: false,
    realWorldEvidence: [
      { source: incident.source, signal: 'roadClass', value: incident.roadClass, quality: incident.stale ? 0.45 : 0.9 },
    ],
    }))
}

function mergeFeedTimeline(
  existing: SurveillanceAlertFeed[],
  previousActiveById: Map<string, SurveillanceAlertFeed>,
  nextActiveById: Map<string, SurveillanceAlertFeed>,
  now: number,
): SurveillanceAlertFeed[] {
  const timeline = [...existing]

  nextActiveById.forEach((activeAlert, id) => {
    const existingActiveIndex = timeline.findIndex((entry) => entry.id === id && !entry.resolved)
    if (existingActiveIndex >= 0) {
      const originalTimestamp = timeline[existingActiveIndex].timestamp
      timeline[existingActiveIndex] = {
        ...timeline[existingActiveIndex],
        ...activeAlert,
        resolved: false,
        timestamp: originalTimestamp,
      }
      return
    }

    timeline.unshift({
      ...activeAlert,
      resolved: false,
      timestamp: now,
    })
  })

  previousActiveById.forEach((previousAlert, id) => {
    if (nextActiveById.has(id)) return

    const openIndex = timeline.findIndex((entry) => entry.id === id && !entry.resolved)
    if (openIndex >= 0) {
      timeline[openIndex] = {
        ...timeline[openIndex],
        resolved: true,
        resolvedAt: now,
      }
      return
    }

    timeline.unshift({
      ...previousAlert,
      id: `${id}:resolved:${now}`,
      resolved: true,
      resolvedAt: now,
      timestamp: now,
    })
  })

  return timeline
    .sort((left, right) => (right.resolvedAt ?? right.timestamp) - (left.resolvedAt ?? left.timestamp))
    .slice(0, FEED_TIMELINE_LIMIT)
}

function rotateTier(pool: HealthNodeLocation[], start: number, count: number, activeSince: number): ActiveHealthNode[] {
  if (pool.length === 0 || count <= 0) return []
  const active: ActiveHealthNode[] = []
  for (let index = 0; index < count; index += 1) {
    const node = pool[(start + index) % pool.length]
    active.push({
      ...node,
      mission: 'SELF-HEALING INTERNET REPAIR',
      activeSince,
    })
  }
  return active
}

function getActiveHealthNodes(now: number): ActiveHealthNode[] {
  const cycle = Math.floor(now / HEALTH_NODE_ROTATION_MS)
  const activeSince = now - ((cycle % 5) * 20_000)

  const byTier: Record<HealthNodeTier, HealthNodeLocation[]> = {
    town: HEALTH_NODE_LOCATIONS.filter((node) => node.tier === 'town').sort((a, b) => a.name.localeCompare(b.name)),
    city: HEALTH_NODE_LOCATIONS.filter((node) => node.tier === 'city').sort((a, b) => a.name.localeCompare(b.name)),
    metropolis: HEALTH_NODE_LOCATIONS.filter((node) => node.tier === 'metropolis').sort((a, b) => a.name.localeCompare(b.name)),
  }

  const starts: Record<HealthNodeTier, number> = {
    metropolis: byTier.metropolis.length > 0 ? cycle % byTier.metropolis.length : 0,
    city: byTier.city.length > 0 ? (cycle * 2) % byTier.city.length : 0,
    town: byTier.town.length > 0 ? (cycle * 3) % byTier.town.length : 0,
  }

  const active = HEALTH_NODE_TIER_ORDER.flatMap((tier) => rotateTier(byTier[tier], starts[tier], HEALTH_NODE_PER_TIER[tier], activeSince))
  return active.slice(0, ACTIVE_HEALTH_NODE_COUNT)
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const points = values.length > 0 ? values : [0]
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const encoded = points
    .slice(-72)
    .map((value, index, arr) => {
      const x = (index / Math.max(arr.length - 1, 1)) * 100
      const y = 100 - (((value - min) / range) * 100)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-full overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="3" points={encoded} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function Surveillance() {
  const intelRuntime = useMemo(() => getIntelBridgeRuntime(), [])
  const [altitude, setAltitude] = useState(78)
  const [clockNow, setClockNow] = useState(Date.now())
  const [focusedNodeId, setFocusedNodeId] = useState('edge-na')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<number>(Date.now())
  const [feedAlerts, setFeedAlerts] = useState<SurveillanceAlertFeed[]>([])
  const [alertFeedClearedAt, setAlertFeedClearedAt] = useState<number>(0)
  const [mapViewportBbox, setMapViewportBbox] = useState<string | null>(null)
  const [telemetrySamples, setTelemetrySamples] = useState<TelemetrySample[]>([])
  const [wireframesVisible, setWireframesVisible] = useState(true)
  const [trafficVisible, setTrafficVisible] = useState(true)
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('satellite')
  const [trafficViewportBbox, setTrafficViewportBbox] = useState<string | null>(null)
  const mapViewportBboxRef = useRef<string | null>(null)
  const [trafficSegments, setTrafficSegments] = useState<VisualizationTrafficSegment[]>([])
  const [trafficIncidentEvents, setTrafficIncidentEvents] = useState<VisualizationAlert[]>([])
  const [trafficProvider, setTrafficProvider] = useState('synthetic')
  const [trafficStale, setTrafficStale] = useState(false)
  const [audioStatus, setAudioStatus] = useState('AUDIO OFF')
  const [audioInputMode, setAudioInputMode] = useState<AudioInputMode>('auto')
  const [audioLevel, setAudioLevel] = useState(0)
  const [audioBands, setAudioBands] = useState<AudioBands>(EMPTY_AUDIO_BANDS)
  const [fusionAutomationState, setFusionAutomationState] = useState('nominal')
  const [backendHealthNodes, setBackendHealthNodes] = useState<ActiveHealthNode[] | null>(null)
  const [healthNodeCapabilityMode, setHealthNodeCapabilityMode] = useState('fallback-local')
  const [healthNodePlaybookCount, setHealthNodePlaybookCount] = useState(0)
  const [healthNodePlaybooks, setHealthNodePlaybooks] = useState<HealthPlaybook[]>([])
  const [healthNodeOperations, setHealthNodeOperations] = useState<HealthOperation[]>([])
  const [healthActionBusy, setHealthActionBusy] = useState(false)
  const [healthActionError, setHealthActionError] = useState<string | null>(null)

  const activeAlertIndexRef = useRef<Map<string, SurveillanceAlertFeed>>(new Map())
  const feedViewportRef = useRef<string | null>(null)
  const audioBandsRef = useRef<AudioBands>(EMPTY_AUDIO_BANDS)
  const audioRef = useRef<AudioRuntime>({})
  const audioShareRef = useRef<BroadcastChannel | null>(null)
  const lastRemoteAudioAtRef = useRef(0)
  const audioSourceIdRef = useRef(`octane-${Math.random().toString(36).slice(2)}`)
  const audioStatusRef = useRef('AUDIO OFF')
  const previousSpectrumRef = useRef<Float32Array | null>(null)
  const previousRmsRef = useRef(0)
  const beatEnvelopeRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const transportRef = useRef<{ stop: () => void } | null>(null)

  const nodesRaw = useSurveillanceIntelStore((state) => state.nodes)
  const subsystemsRaw = useSurveillanceIntelStore((state) => state.subsystems)
  const flowsRaw = useSurveillanceIntelStore((state) => state.flows)
  const eventsRaw = useSurveillanceIntelStore((state) => state.events)
  const geoRaw = useSurveillanceIntelStore((state) => state.geo)
  const metrics = useSurveillanceIntelStore((state) => state.metrics)
  const generatedAt = useSurveillanceIntelStore((state) => state.generatedAt)
  const layerVisibility = useSurveillanceIntelStore((state) => state.layerVisibility)
  const focusMode = useSurveillanceIntelStore((state) => state.focusMode)
  const intervalMs = useSurveillanceIntelStore((state) => state.intervalMs)
  const connection = useSurveillanceIntelStore((state) => state.connection)
  const setIntervalMs = useSurveillanceIntelStore((state) => state.setIntervalMs)
  const setLayerVisibility = useSurveillanceIntelStore((state) => state.setLayerVisibility)
  const setFocusMode = useSurveillanceIntelStore((state) => state.setFocusMode)
  const upsertBundle = useSurveillanceIntelStore((state) => state.upsertBundle)
  const setConnectionState = useSurveillanceIntelStore((state) => state.setConnectionState)
  const loadCachedBundle = useSurveillanceIntelStore((state) => state.loadCachedBundle)
  const fusedEvents = useFusedEventStore((state) => state.getFilteredEvents())
  const setFusedEvents = useFusedEventStore((state) => state.setEvents)

  const nodes = useMemo<VisualizationNode[]>(() => {
    if (nodesRaw.length === 0) return FALLBACK_NODES
    return nodesRaw.map((node) => {
      const signals = node.signals
      const signalLatency = typeof signals.latencyMs === 'number' ? signals.latencyMs : null
      const signalRequests = typeof signals.requestsPerMin === 'number' ? signals.requestsPerMin : null
      const region = typeof signals.region === 'string' ? signals.region : 'Global region'
      const country = typeof signals.country === 'string' ? signals.country : 'Global'
      return {
        id: node.id,
        name: node.label ?? node.id.toUpperCase(),
        country,
        region,
        lat: node.lat,
        lng: node.lon,
        status: mapStatus(node.status),
        latencyMs: Math.round(signalLatency ?? metrics.p95Latency ?? 62),
        loadPercent: Math.round(node.load * 100),
        requestsPerMin: Math.round(signalRequests ?? 4_200 + (node.load * 22_000)),
        connections: node.connections,
      }
    })
  }, [metrics.p95Latency, nodesRaw])

  const events = useMemo<VisualizationAlert[]>(() => eventsRaw.map((event) => ({
    id: event.id,
    type: event.label ?? event.type,
    severity: event.severity,
    title: event.label ?? event.id,
    description: typeof event.signals.description === 'string' ? event.signals.description : 'Live event pulse from global intel feed.',
    serverId: typeof event.signals.nodeId === 'string' ? event.signals.nodeId : undefined,
    timestamp: event.updatedAt,
    lat: event.lat,
    lng: event.lon,
    resolved: false,
  })), [eventsRaw])

  const fusedVisualizationEvents = useMemo<VisualizationAlert[]>(() => fusedEvents.map((event) => ({
    id: event.eventId,
    type: event.eventType,
    severity: event.severity,
    title: event.eventType,
    description: `${event.category} event · status ${event.status} · trend ${event.trend}`,
    timestamp: event.updatedAt,
    lat: event.lat,
    lng: event.lon,
    resolved: event.status === 'resolved',
    probability: event.probability,
    confidence: event.confidence,
    impactScore: event.impactScore,
    priority: event.priority,
    trend: event.trend,
    recommendation: event.recommendation,
    simulatedEvidence: event.simulatedEvidence,
    realWorldEvidence: event.realWorldEvidence,
  })), [fusedEvents])

  const subsystems = useMemo<VisualizationSubsystem[]>(() => subsystemsRaw.map((entry) => ({
    id: entry.id,
    label: entry.label ?? entry.id,
    lat: entry.lat,
    lng: entry.lon,
    status: mapStatus(entry.status),
    load: entry.load,
    updatedAt: entry.updatedAt,
  })), [subsystemsRaw])

  const geo = useMemo<VisualizationGeoOverlay[]>(() => geoRaw.map((entry) => ({
    id: entry.id,
    label: entry.label ?? entry.id,
    lat: entry.lat,
    lng: entry.lon,
    status: entry.status,
    load: entry.load,
    radiusKm: entry.radiusKm,
  })), [geoRaw])

  const curatedTrafficSegments = useMemo(() => curateTrafficSegments(trafficSegments, altitude, basemapMode), [altitude, basemapMode, trafficSegments])
  const congestionOnTrafficMapOnly = basemapMode === 'traffic' && trafficVisible

  const effectiveWireframesVisible = basemapMode === 'traffic' ? false : wireframesVisible

  const activeTrafficCongestion = useMemo(() => {
    if (curatedTrafficSegments.length === 0) return 0
    return curatedTrafficSegments.reduce((sum, segment) => sum + segment.congestionIndex, 0) / curatedTrafficSegments.length
  }, [curatedTrafficSegments])

  const trafficSummary = useMemo(() => {
    const byTone = curatedTrafficSegments.reduce<Record<'clear' | 'moderate' | 'heavy' | 'severe', number>>((acc, segment) => {
      acc[congestionTone(segment.congestionIndex)] += 1
      return acc
    }, { clear: 0, moderate: 0, heavy: 0, severe: 0 })

    const avgSpeed = curatedTrafficSegments.length > 0
      ? Math.round(curatedTrafficSegments.reduce((sum, segment) => sum + segment.currentSpeedKph, 0) / curatedTrafficSegments.length)
      : 0

    return {
      avgSpeed,
      visibleRoads: curatedTrafficSegments.length,
      byTone,
      dominantTone: activeTrafficCongestion >= 0.76 ? 'Severe slowdown' : activeTrafficCongestion >= 0.51 ? 'Heavy congestion' : activeTrafficCongestion >= 0.26 ? 'Moderate congestion' : 'Mostly clear',
    }
  }, [activeTrafficCongestion, curatedTrafficSegments])

  const upstreamEvents = fusedVisualizationEvents.length > 0 ? fusedVisualizationEvents : events
  const activeEvents = useMemo(() => {
    const deduped = new Map<string, VisualizationAlert>()
    upstreamEvents.forEach((event) => {
      deduped.set(event.id, event)
    })
    trafficIncidentEvents.forEach((event) => {
      deduped.set(event.id, event)
    })
    return [...deduped.values()]
  }, [trafficIncidentEvents, upstreamEvents])
  const mapEvents = activeEvents.filter((event) => {
    if (typeof event.lat !== 'number' || typeof event.lng !== 'number') return false
    if (Math.abs(event.lat) < 0.01 && Math.abs(event.lng) < 0.01) return false
    if (event.resolved) return false
    return hasTrustedRealEvidence(event)
  })

  const visibleNodes = layerVisibility.nodes ? nodes : []
  const visibleEvents = layerVisibility.events ? mapEvents : []
  const visibleSubsystems = layerVisibility.subsystems ? subsystems : []
  const visibleGeo = layerVisibility.geo ? geo : []

  const focusedNode = useMemo(() => visibleNodes.find((node) => node.id === focusedNodeId) ?? visibleNodes[0] ?? nodes[0] ?? FALLBACK_NODES[0], [focusedNodeId, nodes, visibleNodes])
  const estimatedTrafficBbox = useMemo(() => estimateTrafficBounds({ lat: focusedNode.lat, lng: focusedNode.lng }, altitude), [altitude, focusedNode.lat, focusedNode.lng])
  const trafficBbox = trafficViewportBbox ?? estimatedTrafficBbox

  const audioReactiveEnabled = audioStatus !== 'AUDIO OFF' && audioStatus !== 'REQUESTING...'
  const audioReactiveState = useMemo(() => ({ enabled: audioReactiveEnabled, level: audioLevel, bands: audioBands }), [audioReactiveEnabled, audioLevel, audioBands])

  const handleMapViewportChange = useCallback((bbox: string) => {
    setTrafficViewportBbox(bbox)
    if (mapViewportBboxRef.current !== bbox) {
      mapViewportBboxRef.current = bbox
      setMapViewportBbox(bbox)
      if (feedViewportRef.current !== null) {
        setFeedAlerts([])
        activeAlertIndexRef.current = new Map()
        setAlertFeedClearedAt(0)
      }
      feedViewportRef.current = bbox
    }
  }, [])

  const reloadNow = useCallback(async () => {
    setConnectionState({ status: 'reconnecting', message: 'Manual refresh in progress', retries: 0, lastUpdateAt: Date.now() })
    try {
      const { fetchGlobalIntelBundle } = await import('@/modules/surveillance/intel')
      const bundle = await fetchGlobalIntelBundle({ timeoutMs: intelRuntime.timeoutMs })
      upsertBundle(bundle)
      setError(null)
      setLoading(false)
      setLastSync(Date.now())
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
      setConnectionState({ status: 'degraded', message: 'Manual refresh failed', retries: 1, lastUpdateAt: Date.now() })
    }
  }, [intelRuntime.timeoutMs, setConnectionState, upsertBundle])

  const refreshHealthNodeBackend = useCallback(async () => {
    const response = await fetch(`/api/v6/self-healing/active-nodes?at=${Date.now()}`, {
      headers: { accept: 'application/json' },
    })
    const payload = await response.json() as HealthNodesApiResponse
    if (!payload.success) return

    const activeNodes = payload.data?.activeNodes
    if (Array.isArray(activeNodes) && activeNodes.length > 0) {
      setBackendHealthNodes(activeNodes)
      setHealthNodeCapabilityMode(payload.data?.capabilityMode ?? 'operator-assist')
      setHealthNodePlaybookCount(payload.data?.playbooks?.length ?? 0)
      setHealthNodePlaybooks(payload.data?.playbooks ?? [])
      setHealthNodeOperations(payload.data?.recentOperations ?? [])
    }
  }, [])

  useEffect(() => {
    audioBandsRef.current = audioBands
  }, [audioBands])

  useEffect(() => {
    audioStatusRef.current = audioStatus
  }, [audioStatus])

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    loadCachedBundle()
    const transport = createPollingIntelTransport(
      {
        intervalMs,
        timeoutMs: intelRuntime.timeoutMs,
        baseUrl: intelRuntime.baseUrl,
      },
      {
        onMessage: (bundle) => {
          upsertBundle(bundle)
          setError(null)
          setLoading(false)
          setLastSync(Date.now())
        },
        onError: (transportError) => {
          setError(transportError.message)
        },
        onState: (state) => {
          if (state.connected) {
            setConnectionState({ status: 'connected', message: 'Telemetry live', retries: state.retries, lastUpdateAt: Date.now() })
            return
          }
          setConnectionState({ status: state.retries >= 3 ? 'degraded' : 'reconnecting', message: 'Retrying telemetry with exponential backoff', retries: state.retries, lastUpdateAt: Date.now() })
        },
      },
    )

    transport.start()
    transportRef.current = transport

    return () => {
      transport.stop()
      transportRef.current = null
    }
  }, [intelRuntime.baseUrl, intelRuntime.timeoutMs, intervalMs, loadCachedBundle, setConnectionState, upsertBundle])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setConnectionState({})
    }, 4_000)

    return () => window.clearInterval(timer)
  }, [setConnectionState])

  useEffect(() => {
    if (!congestionOnTrafficMapOnly) {
      setTrafficSegments([])
      setTrafficIncidentEvents([])
      setTrafficProvider('standby')
      setTrafficStale(false)
      return
    }

    let cancelled = false

    const run = async () => {
      try {
        const result = await runFusionCycle('/api')
        if (cancelled) return
        setFusedEvents(result.events)
        setFusionAutomationState(result.diagnostics.automationState)
        setError(null)
        setLoading(false)
      } catch (fusionError) {
        if (cancelled) return
        setError(fusionError instanceof Error ? fusionError.message : String(fusionError))
      }
    }

    void run()
    const timer = window.setInterval(() => {
      void run()
    }, Math.max(5_000, intervalMs))

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [intervalMs, setFusedEvents])

  useEffect(() => {
    let cancelled = false

    const loadTraffic = async () => {
      try {
        const [flowResponse, incidentResponse] = await Promise.all([
          fetch(`/api/v6/traffic/flow?bbox=${encodeURIComponent(trafficBbox)}`, { headers: { accept: 'application/json' } }),
          fetch(`/api/v6/traffic/incidents?bbox=${encodeURIComponent(trafficBbox)}`, { headers: { accept: 'application/json' } }),
        ])

        const flowPayload = await flowResponse.json() as TrafficFlowResponse
        const incidentPayload = await incidentResponse.json() as TrafficIncidentResponse
        if (cancelled) return

        setTrafficSegments(flowPayload.data?.segments ?? [])
        setTrafficIncidentEvents(toTrafficAlerts(incidentPayload.data?.incidents ?? []))
        setTrafficProvider(incidentPayload.data?.provider ?? flowPayload.data?.provider ?? 'synthetic')
        setTrafficStale(Boolean(flowPayload.data?.stale || incidentPayload.data?.stale))
      } catch {
        if (cancelled) return
        setTrafficSegments([])
        setTrafficIncidentEvents([])
        setTrafficProvider('offline')
        setTrafficStale(true)
      }
    }

    void loadTraffic()
    const timer = window.setInterval(() => {
      void loadTraffic()
    }, TRAFFIC_REFRESH_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [congestionOnTrafficMapOnly, trafficBbox])

  useEffect(() => {
    if (!mapViewportBbox) return
    const activeFeed = activeEvents
      .filter((event) => !event.resolved && hasTrustedRealEvidence(event))
      .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
      .map<SurveillanceAlertFeed>((event) => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        title: event.title ?? event.type,
        description: event.description ?? 'Live event signal',
        probability: event.probability,
        confidence: event.confidence,
        serverId: event.serverId,
        timestamp: event.timestamp ?? Date.now(),
        resolved: false,
      }))

    const previousActiveById = activeAlertIndexRef.current
    const nextActiveById = new Map(activeFeed.map((alert) => [alert.id, alert]))
    activeAlertIndexRef.current = nextActiveById

    setFeedAlerts((current) => mergeFeedTimeline(current, previousActiveById, nextActiveById, Date.now()))
  }, [activeEvents, mapViewportBbox])

  useEffect(() => {
    let cancelled = false

    const loadHealthNodes = async () => {
      try {
        await refreshHealthNodeBackend()
        if (cancelled) return
      } catch {
        if (cancelled) return
        setBackendHealthNodes(null)
        setHealthNodeCapabilityMode('fallback-local')
        setHealthNodePlaybookCount(0)
        setHealthNodePlaybooks([])
        setHealthNodeOperations([])
      }
    }

    void loadHealthNodes()
    const timer = window.setInterval(() => {
      void loadHealthNodes()
    }, HEALTH_NODE_ROTATION_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [refreshHealthNodeBackend])

  const planHealthOperation = useCallback(async () => {
    const currentActiveNodes = backendHealthNodes ?? getActiveHealthNodes(Date.now())
    const firstNode = currentActiveNodes[0]
    const firstPlaybook = healthNodePlaybooks[0]
    if (!firstNode || !firstPlaybook) return
    setHealthActionBusy(true)
    setHealthActionError(null)
    try {
      const response = await fetch('/api/v6/self-healing/active-nodes/heal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          nodeId: firstNode.id,
          playbookId: firstPlaybook.id,
          dryRun: false,
          requestedBy: 'surveillance-ui',
          reason: `Operator plan for ${firstNode.name} with ${firstPlaybook.title}`,
        }),
      })
      if (!response.ok) throw new Error(`Plan failed (${response.status})`)
      await refreshHealthNodeBackend()
    } catch (actionError) {
      setHealthActionError(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      setHealthActionBusy(false)
    }
  }, [backendHealthNodes, healthNodePlaybooks, refreshHealthNodeBackend])

  const approveLatestOperation = useCallback(async () => {
    const target = healthNodeOperations.find((operation) => operation.status === 'awaiting_approval' || operation.status === 'planned')
    if (!target) return
    setHealthActionBusy(true)
    setHealthActionError(null)
    try {
      const response = await fetch(`/api/v6/self-healing/active-nodes/operations/${encodeURIComponent(target.id)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ approvedBy: 'surveillance-ui' }),
      })
      if (!response.ok) throw new Error(`Approve failed (${response.status}) · signed RBAC headers required`)
      await refreshHealthNodeBackend()
    } catch (actionError) {
      setHealthActionError(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      setHealthActionBusy(false)
    }
  }, [healthNodeOperations, refreshHealthNodeBackend])

  const executeLatestOperation = useCallback(async () => {
    const target = healthNodeOperations.find((operation) => operation.status === 'approved')
    if (!target) return
    setHealthActionBusy(true)
    setHealthActionError(null)
    try {
      const response = await fetch(`/api/v6/self-healing/active-nodes/operations/${encodeURIComponent(target.id)}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ executedBy: 'surveillance-ui' }),
      })
      if (!response.ok) throw new Error(`Execute failed (${response.status}) · signed RBAC headers required`)
      await refreshHealthNodeBackend()
    } catch (actionError) {
      setHealthActionError(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      setHealthActionBusy(false)
    }
  }, [healthNodeOperations, refreshHealthNodeBackend])

  const rollbackLatestOperation = useCallback(async () => {
    const target = healthNodeOperations.find((operation) => operation.status === 'succeeded' || operation.status === 'failed')
    if (!target) return
    setHealthActionBusy(true)
    setHealthActionError(null)
    try {
      const response = await fetch(`/api/v6/self-healing/active-nodes/operations/${encodeURIComponent(target.id)}/rollback`, {
        method: 'POST',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`Rollback failed (${response.status})`)
      await refreshHealthNodeBackend()
    } catch (actionError) {
      setHealthActionError(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      setHealthActionBusy(false)
    }
  }, [healthNodeOperations, refreshHealthNodeBackend])

  useEffect(() => {
    const weatherAlerts = activeEvents.filter((alert) => normalizeAlertCategory(alert.type) === 'weather').length
    const trafficAlerts = activeEvents.filter((alert) => normalizeAlertCategory(`${alert.type} ${alert.title} ${alert.description}`) === 'traffic').length
    const avgLoad = visibleNodes.reduce((sum, node) => sum + (node.loadPercent ?? 0), 0) / Math.max(1, visibleNodes.length)

    const liveSample: TelemetrySample = {
      timestamp: Date.now(),
      alerts: activeEvents.length,
      traffic: Math.max(0, Math.min(1, (avgLoad / 100) * 0.34 + (activeTrafficCongestion * 0.56) + Math.min(trafficAlerts, 8) * 0.03)),
      weather: Math.max(0, Math.min(1, (weatherAlerts / Math.max(activeEvents.length, 1)) * 0.9)),
    }

    setTelemetrySamples((current) => [...current.slice(-119), liveSample])
  }, [activeEvents, activeTrafficCongestion, visibleNodes])

  useEffect(() => {
    emitTelemetryEvent('scene:focus', { focusedNodeId: focusedNode.id })
  }, [focusedNode.id])

  const stopAudioReactive = useCallback(() => {
    const current = audioRef.current
    if (current.raf) window.cancelAnimationFrame(current.raf)
    current.stream?.getTracks().forEach((track) => track.stop())
    current.mediaElement?.pause()
    current.mediaElement?.removeAttribute('src')
    if (current.mediaObjectUrl) URL.revokeObjectURL(current.mediaObjectUrl)
    current.source?.disconnect()
    current.analyser?.disconnect()
    current.context?.close().catch(() => undefined)
    audioRef.current = {}
    previousSpectrumRef.current = null
    previousRmsRef.current = 0
    beatEnvelopeRef.current = 0
    setAudioLevel(0)
    setAudioBands(EMPTY_AUDIO_BANDS)
    setAudioStatus('AUDIO OFF')
    const channel = audioShareRef.current
    if (channel) {
      const payload: SharedAudioFrame = {
        sourceId: audioSourceIdRef.current,
        timestamp: Date.now(),
        status: 'AUDIO OFF',
        level: 0,
        bands: EMPTY_AUDIO_BANDS,
      }
      channel.postMessage(payload)
    }
  }, [])

  const beginAudioSession = useCallback(async ({
    stream,
    mediaElement,
    mediaObjectUrl,
    modeLabel,
  }: {
    stream?: MediaStream
    mediaElement?: HTMLAudioElement
    mediaObjectUrl?: string
    modeLabel: string
  }) => {
    const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) throw new Error('Web Audio unsupported')

    const context = new AudioCtor()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.82

    let sourceNode: MediaStreamAudioSourceNode | MediaElementAudioSourceNode
    if (stream) {
      sourceNode = context.createMediaStreamSource(stream)
      sourceNode.connect(analyser)
    } else if (mediaElement) {
      sourceNode = context.createMediaElementSource(mediaElement)
      sourceNode.connect(analyser)
      analyser.connect(context.destination)
    } else {
      throw new Error('No audio source provided')
    }

    const frequencies = new Uint8Array(analyser.frequencyBinCount)
    const waveform = new Uint8Array(analyser.fftSize)

    const hzToBin = (hz: number) => Math.max(0, Math.min(frequencies.length - 1, Math.floor((hz / (context.sampleRate / 2)) * frequencies.length)))
    const readBand = (fromHz: number, toHz: number) => {
      const start = hzToBin(fromHz)
      const end = hzToBin(toHz)
      if (end <= start) return 0
      let sum = 0
      for (let index = start; index <= end; index += 1) sum += frequencies[index]
      return sum / (((end - start) + 1) * 255)
    }

    const loop = () => {
      analyser.getByteFrequencyData(frequencies)
      analyser.getByteTimeDomainData(waveform)

      let rmsAccumulator = 0
      for (let index = 0; index < waveform.length; index += 1) {
        const centered = (waveform[index] - 128) / 128
        rmsAccumulator += centered * centered
      }
      const rms = Math.sqrt(rmsAccumulator / waveform.length)
      const normalizedRms = Math.max(0, Math.min(1, rms * 2.15))

      const spectrumAvg = frequencies.reduce((sum, value) => sum + value, 0) / (frequencies.length * 255)
      const subBass = readBand(20, 60)
      const bass = readBand(60, 180)
      const lowMid = readBand(180, 600)
      const mid = readBand(600, 2000)
      const presence = readBand(2000, 5000)
      const treble = readBand(5000, 12000)
      const brilliance = readBand(12000, 18000)

      const previousSpectrum = previousSpectrumRef.current
      let flux = 0
      if (previousSpectrum) {
        const len = Math.min(previousSpectrum.length, frequencies.length)
        for (let index = 0; index < len; index += 1) {
          const delta = (frequencies[index] / 255) - previousSpectrum[index]
          if (delta > 0) flux += delta
        }
        flux = Math.max(0, Math.min(1, flux / Math.max(1, len * 0.22)))
      }
      previousSpectrumRef.current = Float32Array.from(frequencies, (value) => value / 255)

      let weightedEnergy = 0
      let weightedPosition = 0
      for (let index = 0; index < frequencies.length; index += 1) {
        const energy = frequencies[index] / 255
        weightedEnergy += energy
        weightedPosition += energy * index
      }
      const centroid = weightedEnergy > 0 ? Math.max(0, Math.min(1, (weightedPosition / weightedEnergy) / frequencies.length)) : 0
      const transient = Math.max(0, Math.min(1, (flux * 0.72) + Math.max(0, normalizedRms - previousRmsRef.current) * 2.6))
      previousRmsRef.current = normalizedRms

      const pulse = Math.max(0, Math.min(1, (normalizedRms * 0.3) + (spectrumAvg * 0.2) + (subBass * 0.24) + (bass * 0.26)))
      beatEnvelopeRef.current = Math.max(pulse, beatEnvelopeRef.current * 0.88)
      const beat = Math.max(0, Math.min(1, ((pulse - (beatEnvelopeRef.current * 0.7)) * 3.2) + (transient * 0.36) + (subBass * 0.22)))

      const level = Math.max(0, Math.min(1, (normalizedRms * 0.58) + (spectrumAvg * 0.42)))
      const nextBands: AudioBands = {
        subBass,
        bass,
        lowMid,
        mid,
        presence,
        treble,
        brilliance,
        flux,
        transient,
        centroid,
        pulse,
        beat,
      }

      audioBandsRef.current = nextBands
      setAudioLevel(level)
      setAudioBands(nextBands)

      const channel = audioShareRef.current
      if (channel) {
        const payload: SharedAudioFrame = {
          sourceId: audioSourceIdRef.current,
          timestamp: Date.now(),
          status: `${modeLabel} LIVE`,
          level,
          bands: nextBands,
        }
        channel.postMessage(payload)
      }

      audioRef.current.raf = window.requestAnimationFrame(loop)
    }

    audioRef.current = {
      context,
      analyser,
      source: sourceNode,
      stream,
      mediaElement,
      mediaObjectUrl,
    }
    setAudioStatus(`${modeLabel} LIVE`)
    loop()
  }, [])

  const startAudioReactive = useCallback(async () => {
    if (audioRef.current.stream || audioRef.current.mediaElement) {
      stopAudioReactive()
      return
    }

    setAudioStatus('REQUESTING...')
    try {
      let stream: MediaStream | null = null
      let modeLabel = 'MIC'

      if (audioInputMode !== 'microphone' && audioInputMode !== 'file' && navigator.mediaDevices?.getDisplayMedia) {
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
            preferCurrentTab: false,
            selfBrowserSurface: 'include',
            surfaceSwitching: 'include',
            systemAudio: 'include',
            monitorTypeSurfaces: 'include',
          }

          stream = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints)
          if (!stream.getAudioTracks().length) {
            stream.getTracks().forEach((track) => track.stop())
            stream = null
          } else {
            modeLabel = 'SYSTEM'
          }
        } catch {
          stream = null
          if (audioInputMode === 'system') throw new Error('System audio capture unavailable')
        }
      }

      if (!stream && audioInputMode !== 'system' && audioInputMode !== 'file') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        modeLabel = 'MIC'
      }

      if (!stream) {
        if (audioInputMode === 'file') {
          fileInputRef.current?.click()
          setAudioStatus('SELECT FILE...')
          return
        }
        throw new Error('No audio stream available')
      }

      await beginAudioSession({ stream, modeLabel })
    } catch {
      stopAudioReactive()
    }
  }, [audioInputMode, beginAudioSession, stopAudioReactive])

  const loadAudioFile = useCallback(async (file: File | null) => {
    if (!file) return
    stopAudioReactive()

    try {
      const objectUrl = URL.createObjectURL(file)
      const mediaElement = new Audio(objectUrl)
      mediaElement.crossOrigin = 'anonymous'
      mediaElement.loop = true
      mediaElement.volume = 1
      await mediaElement.play()
      await beginAudioSession({ mediaElement, mediaObjectUrl: objectUrl, modeLabel: 'FILE' })
    } catch {
      stopAudioReactive()
    }
  }, [beginAudioSession, stopAudioReactive])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return

    const channel = new BroadcastChannel(AUDIO_SHARE_CHANNEL)
    audioShareRef.current = channel

    channel.onmessage = (event: MessageEvent<SharedAudioFrame>) => {
      const incoming = event.data
      if (!incoming || incoming.sourceId === audioSourceIdRef.current) return
      if (audioRef.current.stream) return

      lastRemoteAudioAtRef.current = incoming.timestamp
      audioBandsRef.current = incoming.bands
      setAudioLevel(incoming.level)
      setAudioBands(incoming.bands)
      setAudioStatus(incoming.status === 'AUDIO OFF' ? 'AUDIO OFF' : `REMOTE ${incoming.status}`)
    }

    const timeoutWatcher = window.setInterval(() => {
      if (audioRef.current.stream) return
      const status = audioStatusRef.current
      if (status === 'AUDIO OFF' || status === 'REQUESTING...') return
      if (status.startsWith('REMOTE') && Date.now() - lastRemoteAudioAtRef.current > REMOTE_AUDIO_TIMEOUT_MS) {
        setAudioLevel(0)
        setAudioBands(EMPTY_AUDIO_BANDS)
        setAudioStatus('AUDIO OFF')
      }
    }, 1_000)

    return () => {
      window.clearInterval(timeoutWatcher)
      channel.close()
      audioShareRef.current = null
    }
  }, [])

  useEffect(() => stopAudioReactive, [stopAudioReactive])

  const closureFeed = useMemo(() => {
    return feedAlerts
      .filter((alert) => (alert.resolvedAt ?? alert.timestamp) >= alertFeedClearedAt)
      .slice(0, 24)
  }, [alertFeedClearedAt, feedAlerts])

  const liveCategoryCounts = useMemo(() => activeEvents.reduce<Record<GlobalEventCategory, number>>((acc, alert) => {
    const category = normalizeAlertCategory(`${alert.type} ${alert.title} ${alert.description}`)
    acc[category] += 1
    return acc
  }, { traffic: 0, weather: 0, wildfire: 0, police: 0, service: 0 }), [activeEvents])

  const activeHealthNodes = useMemo(() => backendHealthNodes ?? getActiveHealthNodes(clockNow), [backendHealthNodes, clockNow])
  const healthTierCounts = useMemo(() => activeHealthNodes.reduce<Record<HealthNodeTier, number>>((acc, node) => {
    acc[node.tier] += 1
    return acc
  }, { town: 0, city: 0, metropolis: 0 }), [activeHealthNodes])

  const stale = (Date.now() - (connection.lastSuccessAt ?? lastSync)) > STALE_THRESHOLD_MS
  const mapSubtitle = `v7 global intel layered over the v6 sovereign surveillance surface · ${basemapMode} basemap · congestion ${congestionOnTrafficMapOnly ? 'active' : 'standby'} · traffic ${trafficProvider}${trafficStale ? ' · stale' : ''} · ${trafficSummary.dominantTone.toLowerCase()} · health nodes ${activeHealthNodes.length} active · ${healthNodeCapabilityMode}.`

  return (
    <div className="oct-screen space-y-3 md:space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_top,_rgba(0,245,255,0.12),_transparent_42%),linear-gradient(180deg,_rgba(10,16,28,0.96),_rgba(4,8,15,0.98))] p-4 md:p-5 overflow-hidden relative shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-[var(--accent)]"><Radar size={12} /> v6 x v7 SURVEILLANCE FUSION</div>
        <h2 className="mt-2 text-2xl md:text-4xl font-black leading-tight tracking-tight">Global Intelligence Diagnostics Surface</h2>
        <p className="mt-2 max-w-3xl text-sm md:text-[13px] text-[var(--muted)] leading-6">Live global intel is normalized, layered, and rendered on one map canvas with stale-state fallback and stream-ready transport boundaries.</p>
      </div>

      <div className="oct-grid-4">
        <MetricCard label="Nodes" value={visibleNodes.length} accent="var(--accent)" sub="Global compute anchors" />
        <MetricCard label="Active Events" value={activeEvents.length} accent="var(--warn)" sub={`Live intelligence pulses · automation ${fusionAutomationState}`} />
        <MetricCard label="p95 Latency" value={Math.round(metrics.p95Latency || 0)} unit="ms" accent="var(--stellar)" sub="Metrics layer" />
        <MetricCard label="Active Health Nodes" value={activeHealthNodes.length} accent="var(--accent-2)" sub={`${healthTierCounts.metropolis} metropolis · ${healthTierCounts.city} city · ${healthTierCounts.town} town`} />
      </div>

      <Panel title="Map Controls" subtitle="status, layers, and transport control strip">
        <div className="grid gap-2 pt-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em]">
              <div className="flex items-center gap-2">
                <StatusBadge status={connection.status === 'connected' ? 'ok' : connection.status === 'stale' ? 'warn' : connection.status === 'degraded' ? 'crit' : 'info'} label={connection.status.toUpperCase()} />
                <span className="text-[var(--muted)]">{connection.message}</span>
                <span className={`rounded border px-2 py-1 ${stale ? 'border-[var(--warn)] text-[var(--warn)]' : 'border-[var(--border)] text-[var(--muted)]'}`}>{stale ? 'STALE DATA' : 'FRESH'}</span>
              </div>
              <span className="text-[var(--muted)]">Last sync {new Date(lastSync).toLocaleTimeString('en', { hour12: false })}</span>
            </div>
            <div className="mt-2 grid gap-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] md:grid-cols-2">
              <span>Intel upstream {intelRuntime.baseUrl}{intelRuntime.fallbackBaseUrl ? ' (default)' : ' (configured)'}</span>
              <span>Bridge mode {intelRuntime.mode} · retries {intelRuntime.retries} · timeout {Math.round(intelRuntime.timeoutMs / 1000)}s</span>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => void startAudioReactive()} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{audioStatus === 'AUDIO OFF' ? 'Enable Audio' : 'Disable Audio'}</button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Load Audio File</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  void loadAudioFile(file)
                  event.currentTarget.value = ''
                }}
              />
              <select
                value={audioInputMode}
                onChange={(event) => setAudioInputMode(event.target.value as AudioInputMode)}
                className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text)]"
              >
                <option value="auto">Auto Source</option>
                <option value="system">System / Tab</option>
                <option value="microphone">Microphone</option>
                <option value="file">File Playback</option>
              </select>
              <span className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Cross-tab share on</span>
              <button type="button" onClick={() => setWireframesVisible((current) => !current)} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{wireframesVisible ? 'Hide Wireframes' : 'Show Wireframes'}</button>
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Refresh</span>
              <select
                value={intervalMs}
                onChange={(event) => setIntervalMs(Number(event.target.value))}
                className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[var(--text)]"
              >
                <option value={4_000}>4s</option>
                <option value={8_000}>8s</option>
                <option value={15_000}>15s</option>
              </select>
              <button type="button" onClick={() => void reloadNow()} className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[var(--text)]"><RefreshCcw size={11} /> now</button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 lg:col-span-2">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                {(['nodes', 'subsystems', 'flows', 'events', 'geo'] as const).map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    onClick={() => setLayerVisibility(layer, !layerVisibility[layer])}
                    className={`rounded border px-2 py-1 ${layerVisibility[layer] ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
                  >
                    {layer}
                  </button>
                ))}
                <div className="ml-2 flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  <span>Basemap</span>
                  <div className="flex items-center gap-1 rounded border border-[var(--border)] bg-[rgba(3,10,20,0.7)] p-1">
                    <button
                      type="button"
                      onClick={() => setBasemapMode('satellite')}
                      className={`rounded px-2 py-1 ${basemapMode === 'satellite' ? 'border border-[var(--accent)] bg-[rgba(0,245,255,0.1)] text-[var(--text)]' : 'text-[var(--muted)]'}`}
                    >
                      Satellite
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBasemapMode('traffic')
                        setTrafficVisible(true)
                      }}
                      className={`rounded px-2 py-1 ${basemapMode === 'traffic' ? 'border border-[var(--accent)] bg-[rgba(0,245,255,0.1)] text-[var(--text)]' : 'text-[var(--muted)]'}`}
                    >
                      Traffic
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  <span>Congestion</span>
                  <div className="flex items-center gap-1 rounded border border-[var(--border)] bg-[rgba(3,10,20,0.7)] p-1">
                    <button
                      type="button"
                      onClick={() => setTrafficVisible(false)}
                      className={`rounded px-2 py-1 ${!trafficVisible ? 'border border-[var(--accent)] bg-[rgba(0,245,255,0.1)] text-[var(--text)]' : 'text-[var(--muted)]'}`}
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTrafficVisible(true)
                        if (basemapMode !== 'traffic') setBasemapMode('traffic')
                      }}
                      className={`rounded px-2 py-1 ${trafficVisible ? 'border border-[var(--accent)] bg-[rgba(0,245,255,0.1)] text-[var(--text)]' : 'text-[var(--muted)]'}`}
                    >
                      Live
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {(['health', 'flow', 'event'] as IntelFocusMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFocusMode(mode)}
                    className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${focusMode === mode ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="flex min-w-[230px] items-center gap-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">{altitude > 70 ? 'Earth' : altitude > 35 ? 'Regional' : 'Street'}</div>
                <input type="range" min={0} max={100} value={altitude} onChange={(event) => setAltitude(Number(event.target.value))} className="w-full accent-[var(--accent)]" />
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.round(audioLevel * 100)}%` }} /></div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,rgba(8,21,39,0.92),rgba(4,12,24,0.88))] p-3 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">Traffic Signal</div>
                <div className="mt-1 text-sm font-semibold text-[var(--text)]">{trafficSummary.dominantTone}</div>
                <div className="mt-1 text-[11px] text-[var(--muted)]">{trafficSummary.visibleRoads} rendered roads · avg {trafficSummary.avgSpeed} kph · provider {trafficProvider}{trafficStale ? ' · stale fallback risk' : ''}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                <span className="traffic-legend-chip traffic-legend-chip--clear">Clear {trafficSummary.byTone.clear}</span>
                <span className="traffic-legend-chip traffic-legend-chip--moderate">Moderate {trafficSummary.byTone.moderate}</span>
                <span className="traffic-legend-chip traffic-legend-chip--heavy">Heavy {trafficSummary.byTone.heavy}</span>
                <span className="traffic-legend-chip traffic-legend-chip--severe">Severe {trafficSummary.byTone.severe}</span>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.7fr)]">
        <Panel title="Live Intel Map" subtitle={mapSubtitle} className="h-full min-h-[620px]">
          <div className="flex h-full min-h-0 flex-col gap-3 pt-3">
            <div className="mx-2 flex h-full min-h-0 pt-1">
              <SurveillanceMap
                altitude={altitude}
                focusedNodeId={focusedNode.id}
                nodes={visibleNodes}
                alerts={visibleEvents}
                healthNodes={activeHealthNodes}
                basemapMode={basemapMode}
                onTrafficViewportChange={handleMapViewportChange}
                trafficSegments={curatedTrafficSegments}
                subsystems={visibleSubsystems}
                geo={visibleGeo}
                showFlows={layerVisibility.flows && flowsRaw.length > 0}
                showTraffic={congestionOnTrafficMapOnly}
                wireframesVisible={effectiveWireframesVisible}
                audioReactive={audioReactiveState}
                edgeToEdge
              />
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Node Health" subtitle="anchor status and pressure">
            <div className="flex flex-col gap-2 max-h-[315px] overflow-y-auto pr-1">
              {nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setFocusedNodeId(node.id)}
                  className={`rounded border p-3 text-left transition-colors ${focusedNode.id === node.id ? 'border-[var(--accent)] bg-[rgba(0,245,255,0.07)]' : 'border-[var(--border)] bg-[var(--surface2)] hover:border-[var(--accent)]/60'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2"><Server size={12} className="text-[var(--accent)]" /><span className="font-semibold text-[var(--text)]">{node.country}</span></div>
                      <div className="mt-1 text-[11px] text-[var(--muted)]">{node.name} · {node.region}</div>
                    </div>
                    <StatusBadge status={node.status === 'OFFLINE' ? 'crit' : node.status === 'DEGRADED' ? 'warn' : 'ok'} label={node.status} />
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{node.latencyMs}ms latency · {Math.round(node.loadPercent ?? 0)}% load</div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Active Health Nodes" subtitle="self-healing internet repair network">
            <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Cycle {Math.floor(clockNow / HEALTH_NODE_ROTATION_MS)} · rotates every {Math.round(HEALTH_NODE_ROTATION_MS / 1000)}s · mode {healthNodeCapabilityMode} · playbooks {healthNodePlaybookCount}</div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em]">
              <button type="button" onClick={() => void planHealthOperation()} disabled={healthActionBusy || healthNodePlaybooks.length === 0} className="rounded border border-[var(--accent-2)] bg-[rgba(53,240,161,0.12)] px-2 py-1 text-[rgb(164,252,219)] disabled:opacity-50">Plan</button>
              <button type="button" onClick={() => void approveLatestOperation()} disabled={healthActionBusy || !healthNodeOperations.some((operation) => operation.status === 'awaiting_approval' || operation.status === 'planned')} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[var(--text)] disabled:opacity-50">Approve</button>
              <button type="button" onClick={() => void executeLatestOperation()} disabled={healthActionBusy || !healthNodeOperations.some((operation) => operation.status === 'approved')} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[var(--text)] disabled:opacity-50">Execute</button>
              <button type="button" onClick={() => void rollbackLatestOperation()} disabled={healthActionBusy || !healthNodeOperations.some((operation) => operation.status === 'succeeded' || operation.status === 'failed')} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[var(--text)] disabled:opacity-50">Rollback</button>
              {healthActionError ? <span className="text-[var(--warn)]">{healthActionError}</span> : null}
            </div>
            <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
              {activeHealthNodes.map((node) => (
                <div key={node.id} className="rounded border border-[rgba(53,240,161,0.28)] bg-[rgba(4,26,20,0.6)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-[var(--text)]">{node.name}, {node.country}</div>
                    <span className="rounded border border-[rgba(53,240,161,0.35)] bg-[rgba(53,240,161,0.12)] px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-[rgb(164,252,219)]">{node.tier}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">{node.mission}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Repair radius {node.repairRadiusKm}km · active {new Date(node.activeSince).toLocaleTimeString('en', { hour12: false })}</div>
                </div>
              ))}
            </div>
            {healthNodeOperations.length > 0 ? (
              <div className="mt-2 rounded border border-[var(--border)] bg-[var(--surface2)] p-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Recent operations</div>
                <div className="mt-1 flex max-h-[120px] flex-col gap-1 overflow-y-auto pr-1">
                  {healthNodeOperations.slice(0, 6).map((operation) => (
                    <div key={operation.id} className="text-[10px] text-[var(--muted)]">
                      <span className="text-[var(--text)]">{operation.status}</span> · {operation.nodeName} · {operation.playbookTitle}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title="Event Feed" subtitle={error ?? `${Math.round(intervalMs / 1000)}s cadence • ${connection.status}${mapViewportBbox ? ' • viewport active' : ' • awaiting viewport'}`} className="h-[460px]">
            <div className="mb-2 flex items-center justify-end gap-2 text-[10px] uppercase tracking-[0.14em]"><button type="button" onClick={() => setAlertFeedClearedAt(Date.now())} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[var(--muted)] hover:text-[var(--text)]">Clear Feed</button></div>
            <div className="h-[355px]">
              {!mapViewportBbox && (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--accent)] opacity-60">Pan or zoom the map</div>
                  <div className="text-[10px] text-[var(--muted)]">The feed will fill with activity for the area you navigate to</div>
                </div>
              )}
              <div className={`flex h-full flex-col gap-2 overflow-y-auto pr-1 ${!mapViewportBbox ? 'hidden' : ''}`}>
              {closureFeed.slice(0, 14).map((alert) => (
                <button key={alert.id} type="button" onClick={() => setFocusedNodeId(alert.serverId ?? focusedNode.id)} className="rounded border border-[var(--border)] bg-[var(--surface2)] p-3 text-left transition-colors hover:border-[var(--accent)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2"><span className="text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">{alert.type}</span><span className="text-[9px] text-[var(--muted)]">{formatAgo(alert.resolvedAt ?? alert.timestamp, clockNow)}</span></div>
                      <div className="mt-1 text-sm font-semibold text-[var(--text)]">{alert.title}</div>
                      <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{alert.description}</div>
                      {typeof alert.probability === 'number' || typeof alert.confidence === 'number' ? (
                        <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                          Prob {Math.round((alert.probability ?? 0) * 100)}% · Conf {Math.round((alert.confidence ?? 0) * 100)}%
                        </div>
                      ) : null}
                    </div>
                    <StatusBadge status={alert.resolved ? 'ok' : alert.severity === 'CRITICAL' || alert.severity === 'EMERGENCY' ? 'crit' : alert.severity === 'WARNING' ? 'warn' : 'info'} label={alert.resolved ? 'RESOLVED' : alert.severity} />
                  </div>
                </button>
              ))}
              </div>
            </div>
          </Panel>

          <Panel title="Layer Metrics" subtitle="operator read in under 10 seconds">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <MetricCard label="Traffic" value={liveCategoryCounts.traffic} accent="var(--accent)" sub={`${Math.round(activeTrafficCongestion * 100)}% congestion · ${trafficSummary.visibleRoads} roads`} />
              <MetricCard label="Weather" value={liveCategoryCounts.weather} accent="var(--warn)" sub="Storm vectors" />
              <MetricCard label="Fire" value={liveCategoryCounts.wildfire} accent="#a855f7" sub="Perimeter events" />
              <MetricCard label="Police" value={liveCategoryCounts.police} accent="var(--red)" sub="Security alerts" />
              <MetricCard label="Service" value={liveCategoryCounts.service} accent="var(--accent-2)" sub="Infra incidents" />
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Mission Timeline" subtitle="flow and pressure trends">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Traffic flow</div><div className="mt-3"><Sparkline values={telemetrySamples.map((sample) => sample.traffic)} color="var(--accent)" /></div></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Weather pressure</div><div className="mt-3"><Sparkline values={telemetrySamples.map((sample) => sample.weather)} color="var(--amber)" /></div></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Alert intensity</div><div className="mt-3"><Sparkline values={telemetrySamples.map((sample) => sample.alerts)} color="var(--red)" /></div></div>
        </div>
      </Panel>
    </div>
  )
}
