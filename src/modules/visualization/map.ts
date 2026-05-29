import L, { type CircleMarker, type Map as LeafletMap, type Polyline } from 'leaflet'
import type {
  VisualizationAlert,
  VisualizationConfig,
  VisualizationGeoOverlay,
  VisualizationLayerPayload,
  VisualizationNode,
  VisualizationSubsystem,
  VisualizationTrafficSegment,
} from './types'

type MapController = {
  setData: (
    nodes: VisualizationNode[],
    alerts: VisualizationAlert[],
    focusedNodeId?: string,
    layers?: VisualizationLayerPayload,
  ) => void
  setAltitude: (altitude: number) => void
  setBasemap: (mode: 'satellite' | 'traffic') => void
  setViewportChangeHandler: (handler?: (bbox: string) => void) => void
  setAudioReactive: (enabled: boolean, level?: number, bands?: AudioReactiveBands) => void
  setWireframesVisible: (visible: boolean) => void
  getZoom: () => number
  getViewportSpan: () => { latSpan: number; lngSpan: number }
  projectLatLng: (lat: number, lng: number) => { x: number; y: number } | null
  destroy: () => void
}

type LatLng = [number, number]

type AudioReactiveBands = {
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

type ReactiveBurst = {
  line: Polyline
  startDot: CircleMarker
  endDot: CircleMarker
  createdAt: number
  ttl: number
}

type WireAudioProfile = {
  line: Polyline
  baseOpacity: number
  baseWeight: number
  intensity: number
  phase: number
}

type RingAudioProfile = {
  ring: CircleMarker
  baseRadius: number
  phase: number
}

type NodeAudioProfile = {
  marker: CircleMarker
  baseRadius: number
  baseOpacity: number
  baseFillOpacity: number
  phase: number
  statusBoost: number
}

type GeoAudioProfile = {
  ring: L.Circle
  baseRadiusMeters: number
  baseOpacity: number
  baseFillOpacity: number
  phase: number
}

type AmbientAudioDot = {
  dot: CircleMarker
  baseRadius: number
  phase: number
  flashRate: number
  threshold: number
  color: string
  fillColor: string
}

type TrafficSegmentStyle = {
  color: string
  opacity: number
  weight: number
}

type GlobalEventCategory = 'traffic' | 'weather' | 'wildfire' | 'police' | 'service'

type GlobalEventDotProfile = {
  dot: CircleMarker
  baseRadius: number
  severityFactor: number
  phase: number
  category: GlobalEventCategory
}

type DataCenterCity = {
  id: string
  label: string
  lat: number
  lng: number
}

type DataCenterDotProfile = {
  dot: CircleMarker
  baseRadius: number
  phase: number
}

type TrafficAudioProfile = {
  line: Polyline
  baseOpacity: number
  baseWeight: number
  congestion: number
  phase: number
  roadClass: VisualizationTrafficSegment['roadClass']
}

type PairActivationProfile = {
  partnerIndex: number
  phase: number
  gain: number
  gate: number
}

type OctaneV7SimulationProfile = {
  outer: L.Circle
  inner: CircleMarker
  baseRadiusMeters: number
  baseInnerRadius: number
  phase: number
  activationOffset: number
}

const GLOBAL_EVENT_DOT_COLORS: Record<GlobalEventCategory, { stroke: string; fill: string; label: string }> = {
  traffic: { stroke: '#f97316', fill: '#fdba74', label: 'Traffic' },
  weather: { stroke: '#3b82f6', fill: '#93c5fd', label: 'Weather' },
  wildfire: { stroke: '#a855f7', fill: '#d8b4fe', label: 'Fire' },
  police: { stroke: '#ef4444', fill: '#fca5a5', label: 'Police' },
  service: { stroke: '#14b8a6', fill: '#5eead4', label: 'Service' },
}

const AUDIO_DOT_COLORS: Array<{ color: string; fillColor: string }> = [
  { color: '#8ff7ff', fillColor: '#d8ffff' },
  { color: '#7de3ff', fillColor: '#c7f1ff' },
  { color: '#6affc7', fillColor: '#bafde2' },
  { color: '#ffd166', fillColor: '#ffe3a3' },
  { color: '#ff8fab', fillColor: '#ffc2d2' },
  { color: '#c3a6ff', fillColor: '#e1d2ff' },
]

const MAX_REACTIVE_BURSTS = 6
const AMBIENT_AUDIO_DOT_POOL_SIZE = 16
const AUDIO_UPDATE_INTERVAL_MS = 120
const WIREFRAME_STAGGER_BUCKETS = 2
const MAX_QUEUED_BURST_SPAWNS = 10
const PAIR_RESHUFFLE_STEPS = 280
const OCTANE_V7_ACTIVATION_INTERVAL_MS = 1800
const OCTANE_V7_ACTIVATION_BUCKETS = 6

const NETWORK_POINTS: LatLng[] = [
  [64, -150], [57, -105], [49, -125], [40, -100], [32, -85], [22, -102], [15, -90], [6, -79],
  [-5, -62], [-15, -72], [-26, -56], [-36, -66], [-42, -70],
  [54, -10], [47, 2], [52, 16], [44, 30], [40, 12], [36, -4], [28, 20], [20, 0],
  [9, 10], [0, 20], [-10, 34], [-22, 18], [-30, 24], [-34, 18],
  [33, 46], [24, 54], [15, 65], [28, 77], [20, 80], [8, 78], [22, 90], [34, 104],
  [44, 90], [54, 114], [46, 130], [38, 139], [24, 121], [15, 106], [8, 100], [2, 114],
  [-6, 120], [-16, 134], [-24, 146], [-31, 153], [-19, 121],
  [-28, 133], [-34, 147],
  [65, 40], [60, 70], [56, 98], [60, 130],
]

const DATA_CENTER_CITIES: DataCenterCity[] = [
  { id: 'nyc', label: 'NYC', lat: 40.7128, lng: -74.006 },
  { id: 'la', label: 'LA', lat: 34.0522, lng: -118.2437 },
  { id: 'san_francisco', label: 'San Francisco', lat: 37.7749, lng: -122.4194 },
  { id: 'seattle', label: 'Seattle', lat: 47.6062, lng: -122.3321 },
  { id: 'vancouver', label: 'Vancouver', lat: 49.2827, lng: -123.1207 },
  { id: 'toronto', label: 'Toronto', lat: 43.6532, lng: -79.3832 },
  { id: 'montreal', label: 'Montreal', lat: 45.5019, lng: -73.5674 },
  { id: 'chicago', label: 'Chicago', lat: 41.8781, lng: -87.6298 },
  { id: 'boston', label: 'Boston', lat: 42.3601, lng: -71.0589 },
  { id: 'washington_dc', label: 'Washington, D.C.', lat: 38.9072, lng: -77.0369 },
  { id: 'atlanta', label: 'Atlanta', lat: 33.749, lng: -84.388 },
  { id: 'miami', label: 'Miami', lat: 25.7617, lng: -80.1918 },
  { id: 'dallas', label: 'Dallas', lat: 32.7767, lng: -96.797 },
  { id: 'houston', label: 'Houston', lat: 29.7604, lng: -95.3698 },
  { id: 'phoenix', label: 'Phoenix', lat: 33.4484, lng: -112.074 },
  { id: 'las_vegas', label: 'Las Vegas', lat: 36.1699, lng: -115.1398 },
  { id: 'mexico_city', label: 'Mexico City', lat: 19.4326, lng: -99.1332 },
  { id: 'guadalajara', label: 'Guadalajara', lat: 20.6597, lng: -103.3496 },
  { id: 'monterrey', label: 'Monterrey', lat: 25.6866, lng: -100.3161 },
  { id: 'bogota', label: 'Bogota', lat: 4.711, lng: -74.0721 },
  { id: 'lima', label: 'Lima', lat: -12.0464, lng: -77.0428 },
  { id: 'santiago', label: 'Santiago', lat: -33.4489, lng: -70.6693 },
  { id: 'buenos_aires', label: 'Buenos Aires', lat: -34.6037, lng: -58.3816 },
  { id: 'sao_paulo', label: 'Sao Paulo', lat: -23.5505, lng: -46.6333 },
  { id: 'dubai', label: 'Dubai', lat: 25.2048, lng: 55.2708 },
  { id: 'abu_dhabi', label: 'Abu Dhabi', lat: 24.4539, lng: 54.3773 },
  { id: 'doha', label: 'Doha', lat: 25.2854, lng: 51.531 },
  { id: 'riyadh', label: 'Riyadh', lat: 24.7136, lng: 46.6753 },
  { id: 'jeddah', label: 'Jeddah', lat: 21.4858, lng: 39.1925 },
  { id: 'istanbul', label: 'Istanbul', lat: 41.0082, lng: 28.9784 },
  { id: 'cairo', label: 'Cairo', lat: 30.0444, lng: 31.2357 },
  { id: 'lagos', label: 'Lagos', lat: 6.5244, lng: 3.3792 },
  { id: 'nairobi', label: 'Nairobi', lat: -1.2921, lng: 36.8219 },
  { id: 'johannesburg', label: 'Johannesburg', lat: -26.2041, lng: 28.0473 },
  { id: 'cape_town', label: 'Cape Town', lat: -33.9249, lng: 18.4241 },
  { id: 'casablanca', label: 'Casablanca', lat: 33.5731, lng: -7.5898 },
  { id: 'france_paris', label: 'France (Paris)', lat: 48.8566, lng: 2.3522 },
  { id: 'london', label: 'London', lat: 51.5074, lng: -0.1278 },
  { id: 'dublin', label: 'Dublin', lat: 53.3498, lng: -6.2603 },
  { id: 'lisbon', label: 'Lisbon', lat: 38.7223, lng: -9.1393 },
  { id: 'barcelona', label: 'Barcelona', lat: 41.3851, lng: 2.1734 },
  { id: 'rome', label: 'Rome', lat: 41.9028, lng: 12.4964 },
  { id: 'milan', label: 'Milan', lat: 45.4642, lng: 9.19 },
  { id: 'zurich', label: 'Zurich', lat: 47.3769, lng: 8.5417 },
  { id: 'vienna', label: 'Vienna', lat: 48.2082, lng: 16.3738 },
  { id: 'prague', label: 'Prague', lat: 50.0755, lng: 14.4378 },
  { id: 'warsaw', label: 'Warsaw', lat: 52.2297, lng: 21.0122 },
  { id: 'budapest', label: 'Budapest', lat: 47.4979, lng: 19.0402 },
  { id: 'berlin', label: 'Berlin', lat: 52.52, lng: 13.405 },
  { id: 'hamburg', label: 'Hamburg', lat: 53.5511, lng: 9.9937 },
  { id: 'brussels', label: 'Brussels', lat: 50.8503, lng: 4.3517 },
  { id: 'amsterdam', label: 'Amsterdam', lat: 52.3676, lng: 4.9041 },
  { id: 'copenhagen', label: 'Copenhagen', lat: 55.6761, lng: 12.5683 },
  { id: 'stockholm', label: 'Stockholm', lat: 59.3293, lng: 18.0686 },
  { id: 'oslo', label: 'Oslo', lat: 59.9139, lng: 10.7522 },
  { id: 'helsinki', label: 'Helsinki', lat: 60.1699, lng: 24.9384 },
  { id: 'moscow', label: 'Moscow', lat: 55.7558, lng: 37.6173 },
  { id: 'kyiv', label: 'Kyiv', lat: 50.4501, lng: 30.5234 },
  { id: 'athens', label: 'Athens', lat: 37.9838, lng: 23.7275 },
  { id: 'tokyo', label: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { id: 'osaka', label: 'Osaka', lat: 34.6937, lng: 135.5023 },
  { id: 'seoul', label: 'Seoul', lat: 37.5665, lng: 126.978 },
  { id: 'busan', label: 'Busan', lat: 35.1796, lng: 129.0756 },
  { id: 'taipei', label: 'Taipei', lat: 25.033, lng: 121.5654 },
  { id: 'shanghai', label: 'Shanghai', lat: 31.2304, lng: 121.4737 },
  { id: 'beijing', label: 'Beijing', lat: 39.9042, lng: 116.4074 },
  { id: 'shenzhen', label: 'Shenzhen', lat: 22.5431, lng: 114.0579 },
  { id: 'guangzhou', label: 'Guangzhou', lat: 23.1291, lng: 113.2644 },
  { id: 'hong_kong', label: 'Hong Kong', lat: 22.3193, lng: 114.1694 },
  { id: 'wuhan', label: 'Wuhan', lat: 30.5928, lng: 114.3055 },
  { id: 'chengdu', label: 'Chengdu', lat: 30.5728, lng: 104.0668 },
  { id: 'chongqing', label: 'Chongqing', lat: 29.4316, lng: 106.9123 },
  { id: 'singapore', label: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { id: 'kuala_lumpur', label: 'Kuala Lumpur', lat: 3.139, lng: 101.6869 },
  { id: 'jakarta', label: 'Jakarta', lat: -6.2088, lng: 106.8456 },
  { id: 'bangkok', label: 'Bangkok', lat: 13.7563, lng: 100.5018 },
  { id: 'ho_chi_minh_city', label: 'Ho Chi Minh City', lat: 10.8231, lng: 106.6297 },
  { id: 'hanoi', label: 'Hanoi', lat: 21.0278, lng: 105.8342 },
  { id: 'manila', label: 'Manila', lat: 14.5995, lng: 120.9842 },
  { id: 'delhi', label: 'Delhi', lat: 28.6139, lng: 77.209 },
  { id: 'mumbai', label: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { id: 'bengaluru', label: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { id: 'hyderabad', label: 'Hyderabad', lat: 17.385, lng: 78.4867 },
  { id: 'chennai', label: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { id: 'kolkata', label: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { id: 'dhaka', label: 'Dhaka', lat: 23.8103, lng: 90.4125 },
  { id: 'karachi', label: 'Karachi', lat: 24.8607, lng: 67.0011 },
  { id: 'lahore', label: 'Lahore', lat: 31.5497, lng: 74.3436 },
  { id: 'zagreb', label: 'Zagreb', lat: 45.815, lng: 15.9819 },
  { id: 'madrid', label: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { id: 'kabul', label: 'Kabul', lat: 34.5553, lng: 69.2075 },
  { id: 'st_petersburg', label: 'St Petersburg', lat: 59.9311, lng: 30.3609 },
  { id: 'sydney', label: 'Sydney', lat: -33.8688, lng: 151.2093 },
  { id: 'melbourne', label: 'Melbourne', lat: -37.8136, lng: 144.9631 },
  { id: 'brisbane', label: 'Brisbane', lat: -27.4698, lng: 153.0251 },
  { id: 'perth', label: 'Perth', lat: -31.9505, lng: 115.8605 },
  { id: 'auckland', label: 'Auckland', lat: -36.8509, lng: 174.7645 },
  { id: 'rio', label: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729 },
]

const SUPPLEMENTAL_SYSTEM_CITIES: DataCenterCity[] = [
  { id: 'new_york', label: 'New York', lat: 40.7128, lng: -74.0060 },
  { id: 'los_angeles', label: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { id: 'san_diego', label: 'San Diego', lat: 32.7157, lng: -117.1611 },
  { id: 'san_jose', label: 'San Jose', lat: 37.3382, lng: -121.8863 },
  { id: 'sacramento', label: 'Sacramento', lat: 38.5816, lng: -121.4944 },
  { id: 'salt_lake_city', label: 'Salt Lake City', lat: 40.7608, lng: -111.8910 },
  { id: 'denver', label: 'Denver', lat: 39.7392, lng: -104.9903 },
  { id: 'kansas_city', label: 'Kansas City', lat: 39.0997, lng: -94.5786 },
  { id: 'minneapolis', label: 'Minneapolis', lat: 44.9778, lng: -93.2650 },
  { id: 'st_louis', label: 'St Louis', lat: 38.6270, lng: -90.1994 },
  { id: 'detroit', label: 'Detroit', lat: 42.3314, lng: -83.0458 },
  { id: 'cleveland', label: 'Cleveland', lat: 41.4993, lng: -81.6944 },
  { id: 'pittsburgh', label: 'Pittsburgh', lat: 40.4406, lng: -79.9959 },
  { id: 'philadelphia', label: 'Philadelphia', lat: 39.9526, lng: -75.1652 },
  { id: 'charlotte', label: 'Charlotte', lat: 35.2271, lng: -80.8431 },
  { id: 'nashville', label: 'Nashville', lat: 36.1627, lng: -86.7816 },
  { id: 'new_orleans', label: 'New Orleans', lat: 29.9511, lng: -90.0715 },
  { id: 'tampa', label: 'Tampa', lat: 27.9506, lng: -82.4572 },
  { id: 'orlando', label: 'Orlando', lat: 28.5383, lng: -81.3792 },
  { id: 'raleigh', label: 'Raleigh', lat: 35.7796, lng: -78.6382 },
  { id: 'portland_us', label: 'Portland', lat: 45.5152, lng: -122.6784 },
  { id: 'boise', label: 'Boise', lat: 43.6150, lng: -116.2023 },
  { id: 'anchorage_us_hub', label: 'Anchorage Hub', lat: 61.2181, lng: -149.9003 },
  { id: 'paris', label: 'Paris', lat: 48.8566, lng: 2.3522 },
  { id: 'frankfurt', label: 'Frankfurt', lat: 50.1109, lng: 8.6821 },
  { id: 'manama', label: 'Manama', lat: 26.2235, lng: 50.5876 },
  { id: 'honolulu', label: 'Honolulu', lat: 21.3069, lng: -157.8583 },
  { id: 'recife', label: 'Recife', lat: -8.0476, lng: -34.8770 },
  { id: 'accra', label: 'Accra', lat: 5.6037, lng: -0.1870 },
  { id: 'addis_ababa', label: 'Addis Ababa', lat: 8.9806, lng: 38.7578 },
  { id: 'almaty', label: 'Almaty', lat: 43.2220, lng: 76.8512 },
  { id: 'ulan_bator', label: 'Ulaanbaatar', lat: 47.8864, lng: 106.9057 },
  { id: 'suva', label: 'Suva', lat: -18.1248, lng: 178.4501 },
  { id: 'anadyr', label: 'Anadyr', lat: 64.7333, lng: 177.5167 },
  { id: 'anchorage', label: 'Anchorage', lat: 61.2181, lng: -149.9003 },
  { id: 'reykjavik', label: 'Reykjavik', lat: 64.1466, lng: -21.9426 },
  { id: 'bergen', label: 'Bergen', lat: 60.3913, lng: 5.3221 },
  { id: 'curitiba', label: 'Curitiba', lat: -25.4290, lng: -49.2671 },
  { id: 'port_louis', label: 'Port Louis', lat: -20.1609, lng: 57.5012 },
  { id: 'faro', label: 'Faro', lat: 37.0194, lng: -7.9322 },
  { id: 'hobart', label: 'Hobart', lat: -42.8821, lng: 147.3272 },
  { id: 'ushuaia', label: 'Ushuaia', lat: -54.8019, lng: -68.3030 },
  { id: 'galway', label: 'Galway', lat: 53.2707, lng: -9.0568 },
  { id: 'queenstown', label: 'Queenstown', lat: -45.0312, lng: 168.6626 },
  { id: 'nuuk', label: 'Nuuk', lat: 64.1814, lng: -51.6941 },
]

const WIREFRAME_CITIES: DataCenterCity[] = [...DATA_CENTER_CITIES, ...SUPPLEMENTAL_SYSTEM_CITIES]

const WIREFRAME_SIGNAL_POINTS: LatLng[] = (() => {
  const dedupe = new Set<string>()
  const points: LatLng[] = []

  const pushPoint = (lat: number, lng: number) => {
    const normalizedLng = wrapLongitude(lng)
    const key = `${lat.toFixed(4)}|${normalizedLng.toFixed(4)}`
    if (dedupe.has(key)) return
    dedupe.add(key)
    points.push([lat, normalizedLng])
  }

  NETWORK_POINTS.forEach(([lat, lng]) => {
    pushPoint(lat, lng)
  })

  WIREFRAME_CITIES.forEach((city) => {
    pushPoint(city.lat, city.lng)
  })

  return points
})()

const OCEANIC_CABLE_LINKS: Array<[string, string]> = [
  ['nyc', 'london'],
  ['nyc', 'france_paris'],
  ['nyc', 'amsterdam'],
  ['nyc', 'madrid'],
  ['nyc', 'rio'],
  ['la', 'tokyo'],
  ['la', 'sydney'],
  ['seattle', 'tokyo'],
  ['miami', 'rio'],
  ['miami', 'london'],
  ['tokyo', 'sydney'],
  ['dubai', 'london'],
]

const MAJOR_CITY_BACKBONE_LINKS: Array<[string, string]> = [
  ['new_york', 'philadelphia'],
  ['philadelphia', 'boston'],
  ['new_york', 'pittsburgh'],
  ['pittsburgh', 'cleveland'],
  ['cleveland', 'detroit'],
  ['detroit', 'chicago'],
  ['chicago', 'minneapolis'],
  ['chicago', 'st_louis'],
  ['st_louis', 'kansas_city'],
  ['kansas_city', 'denver'],
  ['denver', 'salt_lake_city'],
  ['salt_lake_city', 'boise'],
  ['boise', 'seattle'],
  ['seattle', 'portland_us'],
  ['portland_us', 'san_francisco'],
  ['san_francisco', 'san_jose'],
  ['san_francisco', 'sacramento'],
  ['sacramento', 'los_angeles'],
  ['los_angeles', 'san_diego'],
  ['los_angeles', 'phoenix'],
  ['phoenix', 'dallas'],
  ['dallas', 'houston'],
  ['houston', 'new_orleans'],
  ['new_orleans', 'atlanta'],
  ['atlanta', 'charlotte'],
  ['charlotte', 'raleigh'],
  ['atlanta', 'orlando'],
  ['orlando', 'tampa'],
  ['miami', 'orlando'],
  ['dallas', 'denver'],
  ['new_york', 'washington_dc'],
  ['anchorage_us_hub', 'seattle'],
  ['anchorage_us_hub', 'honolulu'],
  ['nyc', 'london'],
  ['nyc', 'france_paris'],
  ['miami', 'sao_paulo'],
  ['miami', 'bogota'],
  ['la', 'honolulu'],
  ['honolulu', 'sydney'],
  ['honolulu', 'tokyo'],
  ['la', 'tokyo'],
  ['la', 'seoul'],
  ['seattle', 'tokyo'],
  ['vancouver', 'tokyo'],
  ['rio', 'recife'],
  ['recife', 'lisbon'],
  ['accra', 'london'],
  ['accra', 'casablanca'],
  ['london', 'dubai'],
  ['france_paris', 'dubai'],
  ['addis_ababa', 'dubai'],
  ['addis_ababa', 'nairobi'],
  ['istanbul', 'dubai'],
  ['dubai', 'mumbai'],
  ['almaty', 'delhi'],
  ['almaty', 'moscow'],
  ['ulan_bator', 'beijing'],
  ['anadyr', 'tokyo'],
  ['dubai', 'riyadh'],
  ['moscow', 'beijing'],
  ['delhi', 'singapore'],
  ['mumbai', 'singapore'],
  ['singapore', 'jakarta'],
  ['singapore', 'sydney'],
  ['tokyo', 'sydney'],
  ['sydney', 'auckland'],
  ['auckland', 'suva'],
  ['reykjavik', 'nuuk'],
]

function cityLinkDistance(a: DataCenterCity, b: DataCenterCity): number {
  const latScale = 1
  const lngScale = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  const lngDiffRaw = Math.abs(a.lng - b.lng)
  const lngDiff = Math.min(lngDiffRaw, 360 - lngDiffRaw)
  const dx = lngDiff * Math.max(0.35, lngScale)
  const dy = (a.lat - b.lat) * latScale
  return Math.sqrt((dx * dx) + (dy * dy))
}

function buildMajorCityWireframeLinks(cities: DataCenterCity[]): Array<[string, string]> {
  const links: Array<[string, string]> = []
  const dedupe = new Set<string>()
  const byId = new Set(cities.map((city) => city.id))

  const addLink = (fromId: string, toId: string) => {
    if (fromId === toId) return
    if (!byId.has(fromId) || !byId.has(toId)) return
    const left = fromId < toId ? fromId : toId
    const right = fromId < toId ? toId : fromId
    const key = `${left}|${right}`
    if (dedupe.has(key)) return
    dedupe.add(key)
    links.push([left, right])
  }

  const neighborCount = 3
  cities.forEach((city) => {
    const nearest = cities
      .filter((candidate) => candidate.id !== city.id)
      .map((candidate) => ({ candidate, distance: cityLinkDistance(city, candidate) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, neighborCount)

    nearest.forEach(({ candidate }) => {
      addLink(city.id, candidate.id)
    })
  })

  MAJOR_CITY_BACKBONE_LINKS.forEach(([fromId, toId]) => {
    addLink(fromId, toId)
  })

  return links
}

const GLOBAL_CITY_WIREFRAME_LINKS: Array<[string, string]> = buildMajorCityWireframeLinks(WIREFRAME_CITIES)

function markerColor(node: VisualizationNode, config: VisualizationConfig): string {
  if (node.status === 'CRITICAL' || node.status === 'OFFLINE') return config.colors.critical
  if (node.status === 'DEGRADED') return config.colors.degraded
  return config.colors.nominal
}

function wrapLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

function curvedRoutePoints(start: [number, number], end: [number, number]): [number, number][] {
  const [startLat, startLng] = start
  let [endLat, endLng] = end
  let adjustedEndLng = endLng
  let deltaLng = adjustedEndLng - startLng

  // Keep routes continuous across the anti-meridian so links connect naturally.
  if (Math.abs(deltaLng) > 180) {
    adjustedEndLng += deltaLng > 0 ? -360 : 360
    deltaLng = adjustedEndLng - startLng
  }

  const midLat = (startLat + endLat) / 2 + Math.min(16, Math.abs(deltaLng) * 0.04)
  const midLng = (startLng + adjustedEndLng) / 2
  return Array.from({ length: 24 }, (_, index) => {
    const t = index / 23
    const lat = ((1 - t) * (1 - t) * startLat) + (2 * (1 - t) * t * midLat) + (t * t * endLat)
    const lng = ((1 - t) * (1 - t) * startLng) + (2 * (1 - t) * t * midLng) + (t * t * adjustedEndLng)
    return [lat, lng]
  })
}

function appendUniquePoint(points: LatLng[], point: LatLng): void {
  const previous = points[points.length - 1]
  if (!previous) {
    points.push(point)
    return
  }

  if (Math.abs(previous[0] - point[0]) < 1e-6 && Math.abs(previous[1] - point[1]) < 1e-6) {
    return
  }
  points.push(point)
}

function splitRouteAtDateLine(points: Array<[number, number]>): LatLng[][] {
  if (points.length < 2) return []

  const segments: LatLng[][] = []
  let currentSegment: LatLng[] = []
  appendUniquePoint(currentSegment, [points[0][0], wrapLongitude(points[0][1])])

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const next = points[index]

    const previousLng = previous[1]
    const nextLng = next[1]
    const previousWorld = Math.floor((previousLng + 180) / 360)
    const nextWorld = Math.floor((nextLng + 180) / 360)

    if (previousWorld === nextWorld) {
      appendUniquePoint(currentSegment, [next[0], wrapLongitude(nextLng)])
      continue
    }

    const step = nextWorld > previousWorld ? 1 : -1
    const boundaryLng = step > 0
      ? 180 + (360 * previousWorld)
      : -180 + (360 * previousWorld)
    const ratio = (boundaryLng - previousLng) / (nextLng - previousLng)
    const boundaryLat = previous[0] + ((next[0] - previous[0]) * ratio)
    const exitLng: number = step > 0 ? 180 : -180
    const enterLng: number = step > 0 ? -180 : 180

    appendUniquePoint(currentSegment, [boundaryLat, exitLng])
    if (currentSegment.length >= 2) {
      segments.push(currentSegment)
    }

    currentSegment = []
    appendUniquePoint(currentSegment, [boundaryLat, enterLng])
    appendUniquePoint(currentSegment, [next[0], wrapLongitude(nextLng)])
  }

  if (currentSegment.length >= 2) {
    segments.push(currentSegment)
  }
  return segments
}

function curvedRouteSegments(start: [number, number], end: [number, number]): LatLng[][] {
  return splitRouteAtDateLine(curvedRoutePoints(start, end))
}

function routeColor(from: VisualizationNode, to: VisualizationNode, config: VisualizationConfig): string {
  if (
    from.status === 'CRITICAL' || from.status === 'OFFLINE'
    || to.status === 'CRITICAL' || to.status === 'OFFLINE'
  ) {
    return config.colors.critical
  }
  if (from.status === 'DEGRADED' || to.status === 'DEGRADED') {
    return config.colors.degraded
  }
  return config.colors.wireframe
}

function planarDistance(a: LatLng, b: LatLng): number {
  const latScale = 1
  const lngScale = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180)
  const dx = (a[1] - b[1]) * Math.max(0.35, lngScale)
  const dy = (a[0] - b[0]) * latScale
  return Math.sqrt((dx * dx) + (dy * dy))
}

function triangulatedMeshSegments(points: LatLng[], neighbors = 4, maxDistance = 34): Array<[LatLng, LatLng]> {
  const edges = new Set<string>()
  const segments: Array<[LatLng, LatLng]> = []

  points.forEach((point, index) => {
    const nearest = points
      .map((candidate, candidateIndex) => ({ candidate, candidateIndex, distance: planarDistance(point, candidate) }))
      .filter(({ candidateIndex, distance }) => candidateIndex !== index && distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, neighbors)

    nearest.forEach(({ candidateIndex }) => {
      const i = Math.min(index, candidateIndex)
      const j = Math.max(index, candidateIndex)
      const key = `${i}-${j}`
      if (edges.has(key)) return
      edges.add(key)
      segments.push([points[i], points[j]])
    })
  })

  return segments
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function makeSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function buildPairActivationProfiles(length: number, seed: number): PairActivationProfile[] {
  if (length <= 0) return []
  const random = makeSeededRandom(seed)
  const indexes = Array.from({ length }, (_, index) => index)

  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const temp = indexes[index]
    indexes[index] = indexes[swapIndex]
    indexes[swapIndex] = temp
  }

  const profiles: PairActivationProfile[] = Array.from({ length }, () => ({
    partnerIndex: 0,
    phase: 0,
    gain: 1,
    gate: 0.6,
  }))

  for (let index = 0; index < indexes.length; index += 2) {
    const left = indexes[index]
    const right = indexes[index + 1] ?? left
    const phase = random() * Math.PI * 2
    const gain = 0.9 + (random() * 0.4)
    const gate = 0.48 + (random() * 0.34)

    profiles[left] = { partnerIndex: right, phase, gain, gate }
    profiles[right] = { partnerIndex: left, phase, gain, gate }
  }

  return profiles
}

function pairedSyncEnergy(
  index: number,
  profiles: PairActivationProfile[],
  motionStep: number,
  pulse: number,
  beat: number,
  transient: number,
): number {
  const profile = profiles[index]
  if (!profile) return 0
  const base = 0.5 + (Math.sin((motionStep * 0.094) + profile.phase + ((pulse + beat) * 3.4)) * 0.5)
  const gateOpen = base > profile.gate ? 1 : 0.28
  const excitation = clamp01((pulse * 0.34) + (beat * 0.38) + (transient * 0.28))
  return clamp01((base * gateOpen * profile.gain) * (0.52 + (excitation * 0.88)))
}

function randomPoint(points: LatLng[]): LatLng {
  return points[Math.floor(Math.random() * points.length)]
}

function normalizeAlertCategory(rawType: string): GlobalEventCategory {
  const value = rawType.trim().toLowerCase()
  if (value.includes('wildfire') || value.includes('wild fire') || value.includes('brush fire') || value.includes('forest fire') || value.includes('fire')) {
    return 'wildfire'
  }
  if (value.includes('weather') || value.includes('storm') || value.includes('flood') || value.includes('wind')) {
    return 'weather'
  }
  if (value.includes('police') || value.includes('law') || value.includes('crime') || value.includes('security')) {
    return 'police'
  }
  if (
    value.includes('service')
    || value.includes('closure')
    || value.includes('utility')
    || value.includes('maintenance')
    || value.includes('outage')
  ) {
    return 'service'
  }
  return 'traffic'
}

function normalizeAlertCategoryFromAlert(alert: VisualizationAlert): GlobalEventCategory {
  const combined = `${alert.type} ${alert.title ?? ''} ${alert.description ?? ''}`
  return normalizeAlertCategory(combined)
}

export function initMap(container: HTMLElement, config: VisualizationConfig): MapController {
  const WORLD_BOUNDS: [[number, number], [number, number]] = [[-80, -180], [80, 180]]
  const WORLD_LAT_MIN = WORLD_BOUNDS[0][0]
  const WORLD_LAT_MAX = WORLD_BOUNDS[1][0]
  const map = L.map(container, {
    zoomControl: true,
    attributionControl: false,
    minZoom: config.minZoom,
    maxZoom: Math.max(config.maxZoom, 19),
    maxBounds: WORLD_BOUNDS,
    maxBoundsViscosity: 1,
    preferCanvas: true,
    worldCopyJump: true,
  }).setView([20, 0], 2)

  let minViewportZoom = config.minZoom

  const syncMinZoomToBounds = () => {
    // Prevent zooming out beyond the full wireframe/world envelope.
    const fittedZoom = map.getBoundsZoom(WORLD_BOUNDS, false, L.point(0, 0))
    if (!Number.isFinite(fittedZoom)) return

    const nextMinZoom = Math.max(config.minZoom, Math.min(map.getMaxZoom(), fittedZoom))
    minViewportZoom = nextMinZoom
    map.setMinZoom(nextMinZoom)

    if (map.getZoom() < nextMinZoom) {
      map.setZoom(nextMinZoom, { animate: false })
    }
  }

  map.createPane('traffic-flow-pane')
  const trafficPane = map.getPane('traffic-flow-pane')
  if (trafficPane) {
    trafficPane.style.zIndex = '470'
  }

  const trafficRenderer = L.canvas({ padding: 0.5, pane: 'traffic-flow-pane' })

  const satelliteTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    noWrap: false,
    className: 'surveillance-satellite-tiles',
  }).addTo(map)

  const trafficBasemapTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
    opacity: 0,
    className: 'surveillance-traffic-basemap',
  }).addTo(map)

  const streetLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
    opacity: 0.86,
    className: 'surveillance-street-labels',
  }).addTo(map)

  let basemapMode: 'satellite' | 'traffic' = 'satellite'

  const setBasemap = (mode: 'satellite' | 'traffic') => {
    basemapMode = mode
    satelliteTiles.setOpacity(mode === 'traffic' ? 0 : 1)
    trafficBasemapTiles.setOpacity(mode === 'traffic' ? 1 : 0)
    streetLabels.setOpacity(mode === 'traffic' ? 0.94 : 0.86)
  }

  setBasemap('satellite')

  const gridLayer = L.layerGroup().addTo(map)
  const meshLayer = L.layerGroup().addTo(map)
  const octaneV7Layer = L.layerGroup().addTo(map)
  const reactiveMeshLayer = L.layerGroup().addTo(map)
  const ambientDotLayer = L.layerGroup().addTo(map)
  const trafficLayer = L.layerGroup().addTo(map)
  const globalEventLayer = L.layerGroup().addTo(map)
  const subsystemLayer = L.layerGroup().addTo(map)
  const geoLayer = L.layerGroup().addTo(map)
  const markerLayer = L.layerGroup().addTo(map)
  const connectionLayer = L.layerGroup().addTo(map)
  const alertLayer = L.layerGroup().addTo(map)

  const continentMeshLines: Polyline[] = []
  const continentMeshNodes: CircleMarker[] = []
  const dataCenterDotProfiles: DataCenterDotProfile[] = []
  const reactiveBursts: ReactiveBurst[] = []
  const ambientAudioDots: AmbientAudioDot[] = []
  const gridAudioProfiles: WireAudioProfile[] = []
  const globalEventDotProfiles: GlobalEventDotProfile[] = []
  let nodeMarkerProfiles: NodeAudioProfile[] = []
  let latencyRingAudioProfiles: RingAudioProfile[] = []
  let subsystemRingAudioProfiles: RingAudioProfile[] = []
  let geoRingAudioProfiles: GeoAudioProfile[] = []
  let routeAudioProfiles: WireAudioProfile[] = []
  let alertRingProfiles: RingAudioProfile[] = []
  let trafficAudioProfiles: TrafficAudioProfile[] = []
  let gridPairProfiles: PairActivationProfile[] = []
  let routePairProfiles: PairActivationProfile[] = []
  let ambientPairProfiles: PairActivationProfile[] = []
  let dataCenterPairProfiles: PairActivationProfile[] = []
  const octaneV7Profiles: OctaneV7SimulationProfile[] = []
  let octaneV7Tick = 0

  let audioReactiveEnabled = false
  let audioReactiveLevel = 0
  let audioReactiveBands: AudioReactiveBands = {
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
  let motionStep = 0
  let wireframesVisible = true
  let queuedBurstSpawns = 0

  const applyWireframeVisibility = (visible: boolean) => {
    wireframesVisible = visible
    container.classList.toggle('surveillance-wireframes-hidden', !visible)

    if (!visible) {
      reactiveBursts.forEach((burst) => {
        burst.line.remove()
        burst.startDot.remove()
        burst.endDot.remove()
      })
      reactiveBursts.length = 0

      ambientAudioDots.forEach((entry) => {
        entry.dot.setStyle({
          opacity: 0.02,
          fillOpacity: 0.015,
        })
      })

      routeAudioProfiles.forEach((profile) => {
        profile.line.setStyle({
          opacity: 0,
        })
      })

      gridAudioProfiles.forEach((profile) => {
        profile.line.setStyle({
          opacity: 0,
        })
      })

      continentMeshLines.forEach((line) => {
        line.setStyle({
          opacity: 0,
        })
      })

      continentMeshNodes.forEach((node) => {
        node.setRadius(0.1)
        node.setStyle({
          fillOpacity: 0,
          opacity: 0,
        })
      })

      dataCenterDotProfiles.forEach((profile) => {
        profile.dot.setRadius(0.1)
        profile.dot.setStyle({
          fillOpacity: 0,
          opacity: 0,
        })
      })

      octaneV7Profiles.forEach((profile) => {
        profile.outer.setStyle({ opacity: 0, fillOpacity: 0, weight: 0 })
        profile.inner.setStyle({ opacity: 0, fillOpacity: 0 })
      })
    }

    if (visible) {
      gridAudioProfiles.forEach((profile) => {
        profile.line.setStyle({
          opacity: profile.baseOpacity,
          weight: profile.baseWeight,
        })
      })

      continentMeshLines.forEach((line, index) => {
        line.setStyle({
          opacity: index % 8 === 0 ? 0.72 : 0.4,
          weight: index % 8 === 0 ? 1.45 : 0.95,
        })
      })

      continentMeshNodes.forEach((node, index) => {
        node.setRadius(index % 7 === 0 ? 3.8 : 2.3)
        node.setStyle({
          fillOpacity: 0.92,
          opacity: 0.9,
        })
      })

      dataCenterDotProfiles.forEach((profile) => {
        profile.dot.setRadius(profile.baseRadius)
        profile.dot.setStyle({
          fillOpacity: 0.94,
          opacity: 0.96,
        })
      })

      routeAudioProfiles.forEach((profile) => {
        profile.line.setStyle({
          opacity: profile.baseOpacity,
          weight: profile.baseWeight,
        })
      })

      octaneV7Profiles.forEach((profile) => {
        profile.outer.setRadius(profile.baseRadiusMeters)
        profile.outer.setStyle({
          opacity: 0.14,
          fillOpacity: 0.04,
          weight: 0.9,
        })
        profile.inner.setRadius(profile.baseInnerRadius)
        profile.inner.setStyle({
          opacity: 0.76,
          fillOpacity: 0.72,
        })
      })

      alertRingProfiles.forEach((profile) => {
        profile.ring.setRadius(profile.baseRadius)
        profile.ring.setStyle({
          opacity: 0.85,
          weight: 1.2,
        })
      })
    }

  }

  triangulatedMeshSegments(NETWORK_POINTS).forEach(([start, end], index) => {
    const meshLine = L.polyline([start, end], {
      color: '#79f6ff',
      weight: index % 8 === 0 ? 1.45 : 0.95,
      opacity: index % 8 === 0 ? 0.72 : 0.4,
      interactive: false,
      className: 'surveillance-continent-mesh',
    }).addTo(meshLayer)
    continentMeshLines.push(meshLine)
  })

  NETWORK_POINTS.forEach((point, index) => {
    const meshNode = L.circleMarker(point, {
      radius: index % 7 === 0 ? 3.8 : 2.3,
      color: '#8df8ff',
      fillColor: '#d8ffff',
      fillOpacity: 0.92,
      opacity: 0.9,
      weight: 0,
      interactive: false,
      className: 'surveillance-mesh-node',
    }).addTo(meshLayer)
    continentMeshNodes.push(meshNode)
  })

  const dataCenterById = new Map(WIREFRAME_CITIES.map((city) => [city.id, city]))
  const missingDataCenterIds = new Set<string>()
  const registerMissingId = (id: string) => {
    if (missingDataCenterIds.has(id)) return
    missingDataCenterIds.add(id)
    console.warn(`Missing data center city id in wireframe config: ${id}`)
  }

  const drawCableLink = (
    fromId: string,
    toId: string,
    color: string,
    opacity: number,
    weight: number,
  ) => {
    const from = dataCenterById.get(fromId)
    const to = dataCenterById.get(toId)
    if (!from) {
      registerMissingId(fromId)
      return
    }
    if (!to) {
      registerMissingId(toId)
      return
    }

    const line = L.polyline(curvedRouteSegments([from.lat, from.lng], [to.lat, to.lng]), {
      color,
      weight,
      opacity,
      interactive: false,
      className: 'surveillance-continent-mesh surveillance-oceanic-cable',
    }).addTo(meshLayer)
    continentMeshLines.push(line)
  }

  OCEANIC_CABLE_LINKS.forEach(([fromId, toId], index) => {
    drawCableLink(
      fromId,
      toId,
      '#9df6ff',
      index % 2 === 0 ? 0.86 : 0.72,
      index % 2 === 0 ? 1.5 : 1.25,
    )
  })

  GLOBAL_CITY_WIREFRAME_LINKS.forEach(([fromId, toId], index) => {
    drawCableLink(
      fromId,
      toId,
      '#7cefff',
      index % 5 === 0 ? 0.64 : 0.52,
      index % 5 === 0 ? 1.2 : 1,
    )
  })

  WIREFRAME_CITIES.forEach((city, index) => {
    const baseRadius = index % 4 === 0 ? 4.4 : 3.6
    const dot = L.circleMarker([city.lat, city.lng], {
      radius: baseRadius,
      color: '#96f8ff',
      fillColor: '#dcfeff',
      fillOpacity: 0.94,
      opacity: 0.96,
      weight: 1,
      className: 'surveillance-mesh-node surveillance-data-center-dot',
    }).addTo(meshLayer)
    dot.bindTooltip(`${city.label} · Data Center City`, { direction: 'top', opacity: 0.92 })
    dataCenterDotProfiles.push({
      dot,
      baseRadius,
      phase: (index * 0.31) + (city.lat * 0.01),
    })

    const baseRadiusMeters = 120_000 + ((index % 6) * 28_000)
    const outer = L.circle([city.lat, city.lng], {
      radius: baseRadiusMeters,
      color: '#59f2ff',
      fillColor: '#59f2ff',
      fillOpacity: 0.04,
      opacity: 0.14,
      weight: 0.9,
      interactive: false,
      className: 'surveillance-octane-v7-ring',
    }).addTo(octaneV7Layer)

    const baseInnerRadius = 2.4 + ((index % 4) * 0.35)
    const inner = L.circleMarker([city.lat, city.lng], {
      radius: baseInnerRadius,
      color: '#7bf8ff',
      fillColor: '#cffdff',
      fillOpacity: 0.72,
      opacity: 0.76,
      weight: 1,
      interactive: false,
      className: 'surveillance-octane-v7-core',
    }).addTo(octaneV7Layer)

    octaneV7Profiles.push({
      outer,
      inner,
      baseRadiusMeters,
      baseInnerRadius,
      phase: (index * 0.23) + (city.lng * 0.01),
      activationOffset: index % OCTANE_V7_ACTIVATION_BUCKETS,
    })
  })
  dataCenterPairProfiles = buildPairActivationProfiles(dataCenterDotProfiles.length, 211)

  const updateOctaneV7Simulation = (advanceTick = false) => {
    if (advanceTick) octaneV7Tick += 1
    const nowSeconds = Date.now() / 1000
    const pulse = audioReactiveEnabled ? clamp01(audioReactiveBands.pulse) : 0
    const beat = audioReactiveEnabled ? clamp01(audioReactiveBands.beat) : 0
    const flux = audioReactiveEnabled ? clamp01(audioReactiveBands.flux) : 0
    const transient = audioReactiveEnabled ? clamp01(audioReactiveBands.transient) : 0
    const audioEnergy = clamp01((pulse * 0.36) + (beat * 0.28) + (flux * 0.2) + (transient * 0.16) + (audioReactiveLevel * 0.22))

    octaneV7Profiles.forEach((profile) => {
      const wave = 0.5 + (Math.sin((nowSeconds * 1.6) + profile.phase) * 0.5)
      const active = ((octaneV7Tick + profile.activationOffset) % OCTANE_V7_ACTIVATION_BUCKETS) === 0
      const activeBoost = active ? 1 : 0
      const audioRadiusBoost = audioEnergy * (0.06 + (pulse * 0.08) + (transient * 0.06))
      const radiusScale = 1 + (activeBoost * (0.14 + (wave * 0.16))) + audioRadiusBoost

      profile.outer.setRadius(profile.baseRadiusMeters * radiusScale)
      profile.outer.setStyle({
        opacity: wireframesVisible ? (0.1 + (activeBoost * 0.17) + (wave * 0.06) + (audioEnergy * 0.2)) : 0,
        fillOpacity: wireframesVisible ? (0.03 + (activeBoost * 0.08) + (wave * 0.02) + (audioEnergy * 0.08)) : 0,
        weight: wireframesVisible ? (0.8 + (activeBoost * 0.7) + (audioEnergy * 0.6)) : 0,
      })

      profile.inner.setRadius(profile.baseInnerRadius + (activeBoost * (1.8 + (wave * 1.4))) + (audioEnergy * (1.2 + (beat * 0.8))))
      profile.inner.setStyle({
        opacity: wireframesVisible ? (0.55 + (activeBoost * 0.36) + (wave * 0.06) + (audioEnergy * 0.24)) : 0,
        fillOpacity: wireframesVisible ? (0.48 + (activeBoost * 0.4) + (wave * 0.08) + (audioEnergy * 0.3)) : 0,
      })
    })
  }

  updateOctaneV7Simulation()

  const pruneReactiveBursts = () => {
    const now = Date.now()
    for (let index = reactiveBursts.length - 1; index >= 0; index -= 1) {
      const burst = reactiveBursts[index]
      const age = now - burst.createdAt
      if (age >= burst.ttl) {
        burst.line.remove()
        burst.startDot.remove()
        burst.endDot.remove()
        reactiveBursts.splice(index, 1)
        continue
      }

      const life = 1 - (age / burst.ttl)
      const flicker = 0.72 + (Math.sin((motionStep * 0.32) + index) * 0.28)
      const pulse = clamp01(life * flicker)
      burst.line.setStyle({
        opacity: 0.18 + (pulse * 0.85),
        weight: 0.8 + (pulse * 2.4),
      })

      burst.startDot.setStyle({
        opacity: 0.24 + (pulse * 0.74),
        fillOpacity: 0.22 + (pulse * 0.76),
      })
      burst.endDot.setStyle({
        opacity: 0.24 + (pulse * 0.74),
        fillOpacity: 0.22 + (pulse * 0.76),
      })
    }
  }

  const spawnReactiveBurst = (intensity: number) => {
    if (reactiveBursts.length >= MAX_REACTIVE_BURSTS) {
      const oldestBurst = reactiveBursts.shift()
      oldestBurst?.line.remove()
      oldestBurst?.startDot.remove()
      oldestBurst?.endDot.remove()
    }

    const start = randomPoint(WIREFRAME_SIGNAL_POINTS)
    let end = randomPoint(WIREFRAME_SIGNAL_POINTS)
    for (let guard = 0; guard < 3 && start === end; guard += 1) {
      end = randomPoint(WIREFRAME_SIGNAL_POINTS)
    }

    const ttl = 620 + Math.round(820 * intensity)
    const line = L.polyline(curvedRouteSegments(start, end), {
      color: '#8af7ff',
      weight: 1.2 + (2.1 * intensity),
      opacity: 0.55 + (0.3 * intensity),
      interactive: false,
      className: 'surveillance-audio-wire',
    }).addTo(reactiveMeshLayer)

    const startDot = L.circleMarker(start, {
      radius: 2 + (3.2 * intensity),
      color: '#a8fcff',
      fillColor: '#e0ffff',
      fillOpacity: 0.85,
      opacity: 0.9,
      weight: 0,
      interactive: false,
      className: 'surveillance-audio-dot',
    }).addTo(reactiveMeshLayer)

    const endDot = L.circleMarker(end, {
      radius: 2 + (3.2 * intensity),
      color: '#a8fcff',
      fillColor: '#e0ffff',
      fillOpacity: 0.85,
      opacity: 0.9,
      weight: 0,
      interactive: false,
      className: 'surveillance-audio-dot',
    }).addTo(reactiveMeshLayer)

    reactiveBursts.push({ line, startDot, endDot, createdAt: Date.now(), ttl })
  }

  const randomWorldPoint = (): LatLng => {
    const lat = WORLD_LAT_MIN + (Math.random() * (WORLD_LAT_MAX - WORLD_LAT_MIN))
    const lng = -180 + (Math.random() * 360)
    return [lat, lng]
  }

  const randomViewportPoint = (): LatLng => {
    const bounds = map.getBounds()
    const south = Math.max(WORLD_LAT_MIN, bounds.getSouth())
    const north = Math.min(WORLD_LAT_MAX, bounds.getNorth())
    const west = bounds.getWest()
    const east = bounds.getEast()

    const lat = south + (Math.random() * Math.max(0.0001, north - south))
    const lngRaw = west + (Math.random() * Math.max(0.0001, east - west))
    const lng = wrapLongitude(lngRaw)
    return [lat, lng]
  }

  const randomCoastPoint = (): LatLng => {
    const source = randomPoint(WIREFRAME_SIGNAL_POINTS)
    const lat = Math.max(WORLD_LAT_MIN, Math.min(WORLD_LAT_MAX, source[0] + ((Math.random() - 0.5) * 9.5)))
    const lngRaw = source[1] + ((Math.random() - 0.5) * 13)
    const lng = wrapLongitude(lngRaw)
    return [lat, lng]
  }

  const randomTransitPoint = (): LatLng => {
    const start = randomPoint(WIREFRAME_SIGNAL_POINTS)
    let end = randomPoint(WIREFRAME_SIGNAL_POINTS)
    for (let guard = 0; guard < 3 && start === end; guard += 1) {
      end = randomPoint(WIREFRAME_SIGNAL_POINTS)
    }
    const route = curvedRoutePoints(start, end)
    const sample = route[Math.floor(Math.random() * route.length)]
    return [sample[0], wrapLongitude(sample[1])]
  }

  const createAmbientAudioDot = (intensity: number, pulse: number, beat: number, treble: number) => {
    const spawnRoll = Math.random()
    const location = spawnRoll < 0.5
      ? randomViewportPoint()
      : spawnRoll < 0.78
        ? randomWorldPoint()
        : spawnRoll < 0.9
          ? randomCoastPoint()
          : randomTransitPoint()

    const baseRadius = 1.1 + (intensity * 2.6) + (treble * 0.8)
    const ttl = 620 + Math.round((980 * intensity) + (420 * pulse) + (260 * beat))
    const palette = AUDIO_DOT_COLORS[Math.floor(Math.random() * AUDIO_DOT_COLORS.length)]
    const dot = L.circleMarker(location, {
      radius: baseRadius,
      color: palette.color,
      fillColor: palette.fillColor,
      fillOpacity: 0.9,
      opacity: 0.9,
      weight: 0,
      interactive: false,
      className: 'surveillance-audio-scatter-dot',
    }).addTo(ambientDotLayer)

    return {
      dot,
      baseRadius,
      phase: Math.random() * Math.PI * 2,
      flashRate: 0.35 + (Math.random() * 0.55),
      threshold: 0.46 + (Math.random() * 0.24),
      color: palette.color,
      fillColor: palette.fillColor,
    }
  }

  const initializeAmbientAudioDots = () => {
    if (ambientAudioDots.length > 0) return

    for (let index = 0; index < AMBIENT_AUDIO_DOT_POOL_SIZE; index += 1) {
      const intensity = 0.2 + (Math.random() * 0.7)
      const pulse = 0.1 + (Math.random() * 0.9)
      const beat = 0.08 + (Math.random() * 0.82)
      const treble = 0.12 + (Math.random() * 0.78)
      ambientAudioDots.push(createAmbientAudioDot(intensity, pulse, beat, treble))
    }
    ambientPairProfiles = buildPairActivationProfiles(ambientAudioDots.length, 307)
  }

  const updateAmbientAudioDots = (loudness: number, tempo: number, treble: number, pulse: number, beat: number, transient: number): number => {
    let activeCount = 0
    ambientAudioDots.forEach((entry, index) => {
      const strobe = 0.5 + (Math.sin((motionStep * entry.flashRate) + entry.phase + (index * 0.19)) * 0.5)
      const pairSync = pairedSyncEnergy(index, ambientPairProfiles, motionStep, pulse, beat, transient)
      const intensity = clamp01((loudness * 0.38) + (tempo * 0.24) + (treble * 0.14) + (pulse * 0.16) + (pairSync * 0.3))
      const isOn = (intensity + (strobe * 0.55)) > entry.threshold
      if (isOn) activeCount += 1

      entry.dot.setStyle({
        color: entry.color,
        fillColor: entry.fillColor,
        opacity: isOn ? Math.min(1, 0.72 + (pairSync * 0.28)) : 0.02,
        fillOpacity: isOn ? Math.min(1, 0.66 + (pairSync * 0.34)) : 0.015,
      })
    })

    return activeCount
  }

  const severityScale = (severity: VisualizationAlert['severity']): number => {
    if (severity === 'EMERGENCY') return 1.18
    if (severity === 'CRITICAL') return 1.08
    if (severity === 'WARNING') return 1
    return 0.92
  }

  const baseGlobalEventDotRadius = (zoom: number): number => {
    if (zoom <= 2) return 1.65
    if (zoom <= 4) return 2
    if (zoom <= 6) return 2.35
    if (zoom <= 8) return 2.7
    return 3.05
  }

  const applyGlobalEventDotSizing = (audioPulse = 0, audioTransient = 0, audioFlux = 0) => {
    const zoom = map.getZoom()
    const zoomBase = baseGlobalEventDotRadius(zoom)
    globalEventDotProfiles.forEach((profile, index) => {
      const notifying = 0.5 + (Math.sin((motionStep * 0.12) + profile.phase + (index * 0.19)) * 0.5)
      const categoryBoost = profile.category === 'wildfire' ? 0.24 : profile.category === 'police' ? 0.18 : 0.12
      const audioBoost = (audioPulse * 0.26) + (audioTransient * 0.2) + (audioFlux * 0.12)
      const radius = zoomBase + ((profile.baseRadius - 1.8) * 0.24) + (profile.severityFactor * 0.28) + ((notifying + categoryBoost + audioBoost) * 0.44)
      profile.dot.setRadius(Math.max(1.5, Math.min(4.2, radius)))
      profile.dot.setStyle({
        opacity: 0.44 + (notifying * 0.32) + (audioBoost * 0.22),
        fillOpacity: 0.4 + (notifying * 0.3) + (audioBoost * 0.24),
      })
    })
  }

  const onZoomEndUpdateDots = () => {
    applyGlobalEventDotSizing(audioReactiveBands.pulse, audioReactiveBands.transient, audioReactiveBands.flux)
  }

  const updateReactiveMesh = () => {
    motionStep += 1
    const staggerBucket = motionStep % WIREFRAME_STAGGER_BUCKETS

    const flushBurstQueue = (pulse: number, beat: number) => {
      if (queuedBurstSpawns <= 0) return
      const dynamicBudget = pulse > 0.78 || beat > 0.72 ? 2 : 1
      const budget = Math.min(dynamicBudget, queuedBurstSpawns)
      const smoothedIntensity = clamp01((pulse * 0.64) + (beat * 0.36))
      for (let index = 0; index < budget; index += 1) {
        spawnReactiveBurst(smoothedIntensity)
      }
      queuedBurstSpawns = Math.max(0, queuedBurstSpawns - budget)
    }

    // When wireframes are hidden, only prune any in-flight bursts and return early.
    if (!wireframesVisible) {
      queuedBurstSpawns = 0
      if (reactiveBursts.length > 0) pruneReactiveBursts()
    }

    // When audio is off, skip all setStyle work — static CSS handles base appearance.
    // Only prune bursts that were spawned while audio was on and haven't expired yet.
    if (!audioReactiveEnabled) {
      queuedBurstSpawns = 0
      if (reactiveBursts.length > 0) pruneReactiveBursts()
      setBasemap(basemapMode)
      trafficAudioProfiles.forEach((profile) => {
        profile.line.setStyle({
          opacity: profile.baseOpacity,
          weight: profile.baseWeight,
        })
      })
      gridAudioProfiles.forEach((profile) => {
        profile.line.setStyle({
          opacity: profile.baseOpacity,
          weight: profile.baseWeight,
        })
      })
      nodeMarkerProfiles.forEach((profile) => {
        profile.marker.setRadius(profile.baseRadius)
        profile.marker.setStyle({
          opacity: profile.baseOpacity,
          fillOpacity: profile.baseFillOpacity,
        })
      })
      latencyRingAudioProfiles.forEach((profile) => {
        profile.ring.setRadius(profile.baseRadius)
        profile.ring.setStyle({ opacity: 0.35, weight: 1 })
      })
      subsystemRingAudioProfiles.forEach((profile) => {
        profile.ring.setRadius(profile.baseRadius)
        profile.ring.setStyle({ opacity: 0.72, weight: 1.1 })
      })
      geoRingAudioProfiles.forEach((profile) => {
        profile.ring.setRadius(profile.baseRadiusMeters)
        profile.ring.setStyle({
          opacity: profile.baseOpacity,
          fillOpacity: profile.baseFillOpacity,
        })
      })
      if (globalEventDotProfiles.length > 0) applyGlobalEventDotSizing(0, 0, 0)
      return
    }

    // --- Audio-reactive path ---
    const pulse = clamp01((audioReactiveBands.pulse * 0.7) + (audioReactiveLevel * 0.3))
    const beat = clamp01(audioReactiveBands.beat)
    const subBass = clamp01(audioReactiveBands.subBass)
    const bass = clamp01(audioReactiveBands.bass)
    const lowMid = clamp01(audioReactiveBands.lowMid)
    const mid = clamp01(audioReactiveBands.mid)
    const presence = clamp01(audioReactiveBands.presence)
    const treble = clamp01(audioReactiveBands.treble)
    const brilliance = clamp01(audioReactiveBands.brilliance)
    const flux = clamp01(audioReactiveBands.flux)
    const transient = clamp01(audioReactiveBands.transient)
    const centroid = clamp01(audioReactiveBands.centroid)

    updateOctaneV7Simulation()

    if (motionStep % PAIR_RESHUFFLE_STEPS === 0) {
      routePairProfiles = buildPairActivationProfiles(routeAudioProfiles.length, (motionStep * 13) + 17)
      ambientPairProfiles = buildPairActivationProfiles(ambientAudioDots.length, (motionStep * 17) + 23)
      dataCenterPairProfiles = buildPairActivationProfiles(dataCenterDotProfiles.length, (motionStep * 19) + 29)
      gridPairProfiles = buildPairActivationProfiles(gridAudioProfiles.length, (motionStep * 11) + 31)
    }

    if (basemapMode === 'traffic') {
      trafficBasemapTiles.setOpacity(Math.max(0.88, Math.min(1, 0.9 + (pulse * 0.06) + (flux * 0.04))))
      streetLabels.setOpacity(Math.max(0.78, Math.min(1, 0.84 + (presence * 0.08) + (transient * 0.04))))
    } else {
      satelliteTiles.setOpacity(Math.max(0.88, Math.min(1, 0.9 + (pulse * 0.06) + (brilliance * 0.05))))
      streetLabels.setOpacity(Math.max(0.72, Math.min(0.92, 0.8 + (presence * 0.08) + (transient * 0.04))))
    }

    gridAudioProfiles.forEach((profile, index) => {
      if ((index % WIREFRAME_STAGGER_BUCKETS) !== staggerBucket) return
      const shimmer = 0.5 + (Math.sin((motionStep * 0.11) + profile.phase + (index * 0.12)) * 0.5)
      const pairSync = pairedSyncEnergy(index, gridPairProfiles, motionStep, pulse, beat, transient)
      const energy = clamp01((pulse * 0.16) + (flux * 0.18) + (centroid * 0.12) + (presence * 0.1) + (pairSync * 0.22) + (shimmer * 0.22))
      profile.line.setStyle({
        opacity: Math.max(0.12, Math.min(0.92, profile.baseOpacity + (energy * 0.34))),
        weight: Math.max(0.35, profile.baseWeight + (energy * 0.5)),
      })
    })

    // Skip grid line updates — too many elements (30+) and barely visible under tiles.
    // Stagger mesh, routes, and ring updates so pulse spikes do not update every element at once.
    if (wireframesVisible) {
      continentMeshLines.forEach((line, index) => {
        if ((index % WIREFRAME_STAGGER_BUCKETS) !== staggerBucket) return
          const stride = 0.74 + (((index % 9) / 8) * 0.6)
          const shimmer = 0.5 + (Math.sin((motionStep * 0.1 * stride) + index) * 0.5)
          const energy = clamp01((pulse * (0.62 + (shimmer * 0.38))) + (beat * 0.24))
          line.setStyle({
            opacity: 0.22 + (energy * 0.68),
            weight: 0.85 + (energy * 1.6),
          })
        })

      continentMeshNodes.forEach((node, index) => {
        if ((index % WIREFRAME_STAGGER_BUCKETS) !== staggerBucket) return
          const jitter = 0.55 + (Math.sin((motionStep * 0.16) + index) * 0.45)
          const nodeEnergy = clamp01((pulse * 0.75) + (jitter * 0.25))
          const radius = (index % 7 === 0 ? 3.1 : 2.0) + (nodeEnergy * (2.4 + (bass * 0.8)))
          node.setRadius(radius)
          node.setStyle({
            fillOpacity: 0.24 + (nodeEnergy * 0.72),
            opacity: 0.32 + (nodeEnergy * 0.64),
          })
        })

      dataCenterDotProfiles.forEach((profile, index) => {
        if ((index % WIREFRAME_STAGGER_BUCKETS) !== staggerBucket) return
        const shimmer = 0.5 + (Math.sin((motionStep * 0.14) + profile.phase + (index * 0.2)) * 0.5)
        const pairSync = pairedSyncEnergy(index, dataCenterPairProfiles, motionStep, pulse, beat, transient)
        const cityEnergy = clamp01((pulse * 0.26) + (beat * 0.2) + (presence * 0.12) + (brilliance * 0.1) + (pairSync * 0.2) + (transient * 0.08) + (shimmer * 0.22))
        profile.dot.setRadius(profile.baseRadius + (cityEnergy * 2.8))
        profile.dot.setStyle({
          fillOpacity: 0.3 + (cityEnergy * 0.66),
          opacity: 0.42 + (cityEnergy * 0.56),
        })
      })

      routeAudioProfiles.forEach((profile, index) => {
        if ((index % WIREFRAME_STAGGER_BUCKETS) !== staggerBucket) return
        const shimmer = 0.5 + (Math.sin((motionStep * 0.14) + profile.phase + (index * 0.17)) * 0.5)
        const pairSync = pairedSyncEnergy(index, routePairProfiles, motionStep, pulse, beat, transient)
        const energy = clamp01((pulse * 0.24) + (beat * 0.16) + (subBass * 0.12) + (lowMid * 0.1) + (mid * 0.1) + (pairSync * 0.22) + (flux * 0.08) + (shimmer * 0.2))
        const visibility = clamp01((energy * 1.18) - 0.2)
        profile.line.setStyle({
          opacity: 0.03 + (visibility * ((profile.baseOpacity * 0.9) + (0.5 * profile.intensity))),
          weight: 0.26 + (visibility * ((profile.baseWeight * 0.86) + (1.8 * profile.intensity))),
        })
      })
    }

    nodeMarkerProfiles.forEach((profile, index) => {
      if ((index % WIREFRAME_STAGGER_BUCKETS) !== staggerBucket) return
      const shimmer = 0.5 + (Math.sin((motionStep * 0.18) + profile.phase + (index * 0.27)) * 0.5)
      const nodeEnergy = clamp01((pulse * 0.34) + (beat * 0.2) + (subBass * 0.14) + (mid * 0.1) + (presence * 0.08) + (transient * 0.08) + (shimmer * 0.2) + profile.statusBoost)
      profile.marker.setRadius(profile.baseRadius + (nodeEnergy * 2.5))
      profile.marker.setStyle({
        opacity: Math.min(1, profile.baseOpacity + (nodeEnergy * 0.18)),
        fillOpacity: Math.min(1, profile.baseFillOpacity + (nodeEnergy * 0.12)),
      })
    })

    latencyRingAudioProfiles.forEach((profile, index) => {
      if ((index % WIREFRAME_STAGGER_BUCKETS) !== staggerBucket) return
      const shimmer = 0.5 + (Math.sin((motionStep * 0.15) + profile.phase + (index * 0.21)) * 0.5)
      const ringEnergy = clamp01((pulse * 0.3) + (subBass * 0.2) + (bass * 0.14) + (lowMid * 0.12) + (transient * 0.08) + (shimmer * 0.2))
      profile.ring.setRadius(profile.baseRadius + (ringEnergy * 6.4))
      profile.ring.setStyle({
        opacity: 0.22 + (ringEnergy * 0.56),
        weight: 0.8 + (ringEnergy * 1.1),
      })
    })

    subsystemRingAudioProfiles.forEach((profile, index) => {
      if ((index % WIREFRAME_STAGGER_BUCKETS) !== staggerBucket) return
      const shimmer = 0.5 + (Math.sin((motionStep * 0.17) + profile.phase + (index * 0.18)) * 0.5)
      const ringEnergy = clamp01((pulse * 0.24) + (beat * 0.2) + (presence * 0.16) + (treble * 0.14) + (brilliance * 0.1) + (flux * 0.08) + (shimmer * 0.18))
      profile.ring.setRadius(profile.baseRadius + (ringEnergy * 7.8))
      profile.ring.setStyle({
        opacity: 0.3 + (ringEnergy * 0.62),
        weight: 0.9 + (ringEnergy * 1.5),
      })
    })

    geoRingAudioProfiles.forEach((profile, index) => {
      if ((index % WIREFRAME_STAGGER_BUCKETS) !== staggerBucket) return
      const shimmer = 0.5 + (Math.sin((motionStep * 0.1) + profile.phase + (index * 0.14)) * 0.5)
      const geoEnergy = clamp01((pulse * 0.22) + (mid * 0.14) + (presence * 0.16) + (treble * 0.1) + (centroid * 0.1) + (flux * 0.08) + (shimmer * 0.2))
      profile.ring.setRadius(profile.baseRadiusMeters * (1 + (geoEnergy * 0.018)))
      profile.ring.setStyle({
        opacity: Math.min(0.86, profile.baseOpacity + (geoEnergy * 0.32)),
        fillOpacity: Math.min(0.3, profile.baseFillOpacity + (geoEnergy * 0.07)),
      })
    })

    alertRingProfiles.forEach((profile, index) => {
      if ((index % WIREFRAME_STAGGER_BUCKETS) !== staggerBucket) return
      const shimmer = 0.5 + (Math.sin((motionStep * 0.22) + profile.phase + (index * 0.31)) * 0.5)
      const ringEnergy = clamp01((beat * 0.3) + (pulse * 0.22) + (transient * 0.18) + (presence * 0.14) + (treble * 0.1) + (shimmer * 0.2))
      profile.ring.setRadius(profile.baseRadius + (ringEnergy * 8.2))
      profile.ring.setStyle({
        opacity: 0.08 + (ringEnergy * 0.86),
        weight: 0.55 + (ringEnergy * 1.7),
      })
    })

    trafficAudioProfiles.forEach((profile, index) => {
      if ((index % WIREFRAME_STAGGER_BUCKETS) !== staggerBucket) return
      const shimmer = 0.5 + (Math.sin((motionStep * 0.2) + profile.phase + (index * 0.16)) * 0.5)
      const roadBoost = profile.roadClass === 'highway' ? 0.2 : profile.roadClass === 'arterial' ? 0.14 : 0.08
      const energy = clamp01((pulse * 0.28) + (beat * 0.2) + (transient * 0.16) + (flux * 0.14) + (profile.congestion * 0.18) + roadBoost + (shimmer * 0.16))
      profile.line.setStyle({
        opacity: Math.max(0.28, Math.min(0.98, profile.baseOpacity + (energy * 0.24))),
        weight: Math.max(1.4, profile.baseWeight + (energy * 1.7)),
      })
    })

    const loudness = clamp01((audioReactiveLevel * 0.34) + (pulse * 0.22) + (subBass * 0.18) + (bass * 0.14) + (transient * 0.12))
    const tempo = clamp01((beat * 0.38) + (mid * 0.14) + (presence * 0.14) + (brilliance * 0.08) + (flux * 0.16) + (transient * 0.1))
    updateAmbientAudioDots(loudness, tempo, treble, pulse, beat, transient)
    applyGlobalEventDotSizing(pulse, transient, flux)

    if (wireframesVisible) {
      const performancePressure = clamp01((reactiveBursts.length / MAX_REACTIVE_BURSTS) * 0.65)
      const spawnChance = clamp01((0.08 + (pulse * 0.44) + (beat * 0.34)) * (1 - (performancePressure * 0.55)))

      if (Math.random() < spawnChance) {
        const burstCount = Math.max(1, Math.round((1 + (beat * 2.4)) * (1 - (performancePressure * 0.65))))
        queuedBurstSpawns = Math.min(MAX_QUEUED_BURST_SPAWNS, queuedBurstSpawns + burstCount)
      }
      flushBurstQueue(pulse, beat)
    } else {
      queuedBurstSpawns = 0
    }
    pruneReactiveBursts()
  }

  initializeAmbientAudioDots()

  const octaneV7Timer = window.setInterval(() => updateOctaneV7Simulation(true), OCTANE_V7_ACTIVATION_INTERVAL_MS)
  const reactiveTimer = window.setInterval(updateReactiveMesh, AUDIO_UPDATE_INTERVAL_MS)

  for (let lat = -80; lat <= 80; lat += 20) {
    const line = L.polyline([[lat, -180], [lat, 180]], {
      color: config.colors.wireframe,
      weight: 0.45,
      opacity: 0.4,
      interactive: false,
      className: 'surveillance-gridline',
    }).addTo(gridLayer)
    gridAudioProfiles.push({ line, baseOpacity: 0.4, baseWeight: 0.45, intensity: 0.66, phase: lat * 0.07 })
  }
  for (let lon = -180; lon <= 180; lon += 30) {
    const line = L.polyline([[-80, lon], [80, lon]], {
      color: config.colors.wireframe,
      weight: 0.45,
      opacity: 0.4,
      interactive: false,
      className: 'surveillance-gridline',
    }).addTo(gridLayer)
    gridAudioProfiles.push({ line, baseOpacity: 0.4, baseWeight: 0.45, intensity: 0.7, phase: lon * 0.04 })
  }
  gridPairProfiles = buildPairActivationProfiles(gridAudioProfiles.length, 101)

  let markers: CircleMarker[] = []
  let connections: Polyline[] = []
  let alertsRings: CircleMarker[] = []
  let latencyRings: CircleMarker[] = []
  let trafficSegmentLines: Polyline[] = []
  let globalEventDots: CircleMarker[] = []
  let subsystemRings: CircleMarker[] = []
  let geoRings: Array<L.Circle> = []
  let hasInitialBounds = false
  let lastFocusedNodeId: string | undefined
  let viewportChangeHandler: ((bbox: string) => void) | undefined

  const formatViewportBbox = () => {
    const bounds = map.getBounds()
    return `${bounds.getWest().toFixed(4)},${bounds.getSouth().toFixed(4)},${bounds.getEast().toFixed(4)},${bounds.getNorth().toFixed(4)}`
  }

  const emitViewportChange = () => {
    viewportChangeHandler?.(formatViewportBbox())
  }

  const markUserNavigation = () => {
    hasInitialBounds = true
  }

  map.on('dragstart', markUserNavigation)
  map.on('zoomstart', markUserNavigation)
  map.on('zoomend', onZoomEndUpdateDots)
  map.on('moveend', emitViewportChange)
  map.on('zoomend', emitViewportChange)

  const applyRouteDynamics = (line: Polyline, avgLatency: number, riskLevel: 'normal' | 'elevated' | 'critical') => {
    const element = line.getElement() as SVGPathElement | null
    if (!element) return

    const speedSeconds = Math.max(2.6, Math.min(10, 2.6 + (avgLatency / 42)))
    const glowStrength = Math.max(0.24, Math.min(0.92, 1 - (avgLatency / 280)))
    element.style.setProperty('--route-speed', `${speedSeconds.toFixed(2)}s`)
    element.style.setProperty('--route-glow', glowStrength.toFixed(2))
    element.classList.remove('surveillance-route-line--normal', 'surveillance-route-line--elevated', 'surveillance-route-line--critical')
    element.classList.add(
      riskLevel === 'critical'
        ? 'surveillance-route-line--critical'
        : riskLevel === 'elevated'
          ? 'surveillance-route-line--elevated'
          : 'surveillance-route-line--normal',
    )
  }

  const trafficStyle = (segment: VisualizationTrafficSegment): TrafficSegmentStyle => {
    const congestion = clamp01(segment.congestionIndex)
    const trafficMode = basemapMode === 'traffic'
    const color = congestion >= 0.76
      ? '#d93025'
      : congestion >= 0.51
        ? '#ff8f00'
        : congestion >= 0.26
          ? '#fbbc04'
          : '#34a853'
    const baseWeight = trafficMode
      ? (segment.roadClass === 'highway' ? 5.8 : segment.roadClass === 'arterial' ? 4.4 : 3.5)
      : (segment.roadClass === 'highway' ? 4.8 : segment.roadClass === 'arterial' ? 3.6 : 2.8)
    const stalePenalty = segment.stale ? (trafficMode ? 0.08 : 0.14) : 0
    return {
      color,
      opacity: Math.max(trafficMode ? 0.82 : 0.5, (trafficMode ? 0.9 : 0.72) + (congestion * (trafficMode ? 0.08 : 0.2)) - stalePenalty),
      weight: baseWeight,
    }
  }

  const forceFullSize = () => {
    // Leaflet can initialize with stale dimensions when parent layout is still settling.
    map.invalidateSize({ pan: false, animate: false })
    syncMinZoomToBounds()
  }

  const resizeObserver = new ResizeObserver(() => {
    forceFullSize()
  })
  resizeObserver.observe(container)

  requestAnimationFrame(() => {
    forceFullSize()
    requestAnimationFrame(() => forceFullSize())
  })

  const setData = (
    nodes: VisualizationNode[],
    alerts: VisualizationAlert[],
    focusedNodeId?: string,
    layers?: VisualizationLayerPayload,
  ) => {
    forceFullSize()
    const showFlows = layers?.showFlows ?? true
    const showTraffic = layers?.showTraffic ?? true
    const subsystems = layers?.subsystems ?? []
    const geo = layers?.geo ?? []
    const trafficSegmentsPayload = layers?.trafficSegments ?? []

    markers.forEach((marker) => marker.remove())
    connections.forEach((line) => line.remove())
    alertsRings.forEach((marker) => marker.remove())
    latencyRings.forEach((ring) => ring.remove())
    trafficSegmentLines.forEach((segment) => segment.remove())
    globalEventDots.forEach((dot) => dot.remove())
    subsystemRings.forEach((ring) => ring.remove())
    geoRings.forEach((ring) => ring.remove())
    markers = []
    connections = []
    alertsRings = []
    latencyRings = []
    trafficSegmentLines = []
    globalEventDots = []
    subsystemRings = []
    geoRings = []
    globalEventDotProfiles.length = 0
    nodeMarkerProfiles = []
    latencyRingAudioProfiles = []
    subsystemRingAudioProfiles = []
    geoRingAudioProfiles = []
    routeAudioProfiles = []
    routePairProfiles = []
    alertRingProfiles = []
    trafficAudioProfiles = []

    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const edgeRegistry = new Set<string>()

    for (const node of nodes) {
      const marker = L.circleMarker([node.lat, node.lng], {
        radius: 5,
        color: markerColor(node, config),
        fillColor: markerColor(node, config),
        fillOpacity: 0.92,
        opacity: 0.95,
        weight: 1,
        className: 'surveillance-node-marker',
      }).addTo(markerLayer)
      marker.bindTooltip(`${node.country} · ${node.region} · ${node.latencyMs}ms · ${node.status}`, { direction: 'top', opacity: 0.92 })
      markers.push(marker)
      nodeMarkerProfiles.push({
        marker,
        baseRadius: 5,
        baseOpacity: 0.95,
        baseFillOpacity: 0.92,
        phase: (node.lat * 0.04) + (node.lng * 0.02),
        statusBoost: node.status === 'CRITICAL' || node.status === 'OFFLINE' ? 0.24 : node.status === 'DEGRADED' ? 0.14 : 0.06,
      })

      const latencyRing = L.circleMarker([node.lat, node.lng], {
        radius: 8 + Math.min(node.latencyMs / 28, 12),
        color: markerColor(node, config),
        fillOpacity: 0,
        opacity: 0.35,
        weight: 1,
        className: 'surveillance-latency-ring',
      }).addTo(alertLayer)
      latencyRings.push(latencyRing)
      latencyRingAudioProfiles.push({
        ring: latencyRing,
        baseRadius: 8 + Math.min(node.latencyMs / 28, 12),
        phase: (node.lat * 0.06) + (node.lng * 0.03),
      })

      for (const connectionId of node.connections) {
        if (!showFlows) continue
        const target = nodeById.get(connectionId)
        if (!target) continue

        const edgeKey = node.id < target.id ? `${node.id}|${target.id}` : `${target.id}|${node.id}`
        if (edgeRegistry.has(edgeKey)) continue
        edgeRegistry.add(edgeKey)

        const avgLatency = (node.latencyMs + target.latencyMs) / 2
        const avgLoad = ((node.loadPercent ?? 40) + (target.loadPercent ?? 40)) / 2
        const loadFactor = Math.max(0, Math.min(1, avgLoad / 100))
        const riskLevel: 'normal' | 'elevated' | 'critical' = (
          node.status === 'CRITICAL' || node.status === 'OFFLINE' || target.status === 'CRITICAL' || target.status === 'OFFLINE'
            ? 'critical'
            : node.status === 'DEGRADED' || target.status === 'DEGRADED' || avgLatency >= 120
              ? 'elevated'
              : 'normal'
        )

        const line = L.polyline(curvedRouteSegments([node.lat, node.lng], [target.lat, target.lng]), {
          color: routeColor(node, target, config),
          opacity: wireframesVisible
            ? ((riskLevel === 'critical' ? 0.72 : riskLevel === 'elevated' ? 0.56 : 0.44) + (loadFactor * 0.14))
            : 0,
          weight: (riskLevel === 'critical' ? 1.9 : riskLevel === 'elevated' ? 1.5 : 1.15) + (loadFactor * 0.8),
          className: 'surveillance-route-line',
        }).addTo(connectionLayer)
        applyRouteDynamics(line, avgLatency, riskLevel)
        line.on('add', () => applyRouteDynamics(line, avgLatency, riskLevel))
        connections.push(line)
        routeAudioProfiles.push({
          line,
          baseOpacity: (riskLevel === 'critical' ? 0.72 : riskLevel === 'elevated' ? 0.56 : 0.44) + (loadFactor * 0.14),
          baseWeight: (riskLevel === 'critical' ? 1.9 : riskLevel === 'elevated' ? 1.5 : 1.15) + (loadFactor * 0.8),
          intensity: Math.max(0.4, Math.min(1.2, (riskLevel === 'critical' ? 1 : riskLevel === 'elevated' ? 0.82 : 0.68) + (loadFactor * 0.24))),
          phase: (node.lat * 0.03) + (target.lng * 0.02),
        })
      }
    }
    routePairProfiles = buildPairActivationProfiles(routeAudioProfiles.length, (nodes.length * 37) + (alerts.length * 13) + 19)

    subsystems.forEach((subsystem: VisualizationSubsystem) => {
      const load = Math.max(0, Math.min(1, subsystem.load))
      const ring = L.circleMarker([subsystem.lat, subsystem.lng], {
        radius: 14 + (load * 16),
        color: subsystem.status === 'CRITICAL' || subsystem.status === 'OFFLINE'
          ? config.colors.critical
          : subsystem.status === 'DEGRADED'
            ? config.colors.degraded
            : '#58b7ff',
        fillOpacity: 0,
        opacity: 0.72,
        weight: 1.1 + (load * 1.4),
        className: 'surveillance-alert-ring',
      }).addTo(subsystemLayer)
      ring.bindTooltip(`${subsystem.label} · ${(load * 100).toFixed(0)}%`, { direction: 'top', opacity: 0.9 })
      subsystemRings.push(ring)
      subsystemRingAudioProfiles.push({
        ring,
        baseRadius: 14 + (load * 16),
        phase: (subsystem.lat * 0.05) + (subsystem.lng * 0.025),
      })
    })

    geo.forEach((overlay: VisualizationGeoOverlay) => {
      const load = Math.max(0, Math.min(1, overlay.load))
      const ring = L.circle([overlay.lat, overlay.lng], {
        radius: Math.max(60_000, overlay.radiusKm * 1000),
        color: '#5eead4',
        fillColor: '#5eead4',
        fillOpacity: 0.04 + (load * 0.08),
        opacity: 0.2 + (load * 0.3),
        weight: 1,
        interactive: false,
      }).addTo(geoLayer)
      geoRings.push(ring)
      geoRingAudioProfiles.push({
        ring,
        baseRadiusMeters: Math.max(60_000, overlay.radiusKm * 1000),
        baseOpacity: 0.2 + (load * 0.3),
        baseFillOpacity: 0.04 + (load * 0.08),
        phase: (overlay.lat * 0.03) + (overlay.lng * 0.016),
      })
    })

    if (showTraffic) {
      trafficSegmentsPayload.forEach((segment) => {
        if (segment.polyline.length < 2) return
        const style = trafficStyle(segment)
        const trafficLine = L.polyline(segment.polyline, {
          color: style.color,
          opacity: style.opacity,
          weight: style.weight,
          pane: 'traffic-flow-pane',
          lineCap: 'round',
          lineJoin: 'round',
          renderer: trafficRenderer,
          smoothFactor: basemapMode === 'traffic' ? 0.6 : 1.1,
          className: 'surveillance-traffic-segment surveillance-traffic-segment--flow',
        }).addTo(trafficLayer)

        if (segment.roadClass !== 'collector' || segment.congestionIndex >= 0.45) {
          trafficLine.bindTooltip(
            `<strong>${segment.roadClass.toUpperCase()} traffic</strong><br/>`
            + `<span>${Math.round(segment.currentSpeedKph)} kph current · ${Math.round(segment.freeFlowSpeedKph)} kph free-flow</span><br/>`
            + `<span>${Math.round(segment.congestionIndex * 100)}% congestion · confidence ${Math.round(segment.confidence * 100)}%</span><br/>`
            + `<span>Source: ${segment.source}${segment.stale ? ' · stale' : ''}</span>`,
            {
              direction: 'top',
              opacity: 0.92,
              sticky: true,
            },
          )
        }

        trafficSegmentLines.push(trafficLine)
        trafficAudioProfiles.push({
          line: trafficLine,
          baseOpacity: style.opacity,
          baseWeight: style.weight,
          congestion: segment.congestionIndex,
          phase: (segment.centroid.lat * 0.06) + (segment.centroid.lng * 0.03),
          roadClass: segment.roadClass,
        })
      })
    }

    for (const alert of alerts) {
      const node = alert.serverId ? nodeById.get(alert.serverId) : undefined
      const category = normalizeAlertCategoryFromAlert(alert)
      const palette = GLOBAL_EVENT_DOT_COLORS[category]
      const alertLocation: LatLng | null = (
        typeof alert.lat === 'number' && typeof alert.lng === 'number'
          ? [alert.lat, wrapLongitude(alert.lng)]
          : alert.location && typeof alert.location.lat === 'number' && typeof alert.location.lng === 'number'
            ? [alert.location.lat, wrapLongitude(alert.location.lng)]
          : node
            ? [node.lat, node.lng]
            : null
      )

      if (!alertLocation) continue

      const baseRadius = 2.05 * severityScale(alert.severity)

      const eventDot = L.circleMarker(alertLocation, {
        radius: baseRadius,
        color: palette.stroke,
        fillColor: palette.fill,
        fillOpacity: 0.84,
        opacity: 0.9,
        weight: 1,
        className: 'surveillance-global-event-dot',
      })
      const applyPulseOffset = () => {
        const element = eventDot.getElement() as SVGElement | null
        if (!element) return
        const offset = -((Math.random() * 3.4) + 0.2)
        element.style.setProperty('--event-pulse-offset', `${offset.toFixed(2)}s`)
      }
      eventDot.on('add', applyPulseOffset)
      eventDot.addTo(globalEventLayer)
      applyPulseOffset()

      const dotTitle = alert.title ?? `${palette.label} alert`
      const dotSubtitle = `${palette.label} · ${alert.type} · ${alert.severity}`
      const dotBody = alert.description?.trim() || 'Active call in progress.'
      const probabilityText = typeof alert.probability === 'number' ? `${Math.round(alert.probability * 100)}%` : 'n/a'
      const confidenceText = typeof alert.confidence === 'number' ? `${Math.round(alert.confidence * 100)}%` : 'n/a'
      const impactText = typeof alert.impactScore === 'number' ? `${Math.round(alert.impactScore * 100)}%` : 'n/a'
      const sourceTrace = [
        ...(alert.simulatedEvidence?.slice(0, 2).map((entry) => `SIM:${entry.source}`) ?? []),
        ...(alert.realWorldEvidence?.slice(0, 2).map((entry) => `OBS:${entry.source}`) ?? []),
      ]
      const recommendation = alert.recommendation?.[0]
      eventDot.bindTooltip(
        `<strong>${dotTitle}</strong><br/>`
        + `<span>${dotSubtitle}</span><br/>`
        + `<span>Probability: ${probabilityText} · Confidence: ${confidenceText}</span><br/>`
        + `<span>Impact: ${impactText}${alert.priority ? ` · Priority: ${alert.priority.toUpperCase()}` : ''}</span><br/>`
        + `<span>${dotBody}</span>`
        + (sourceTrace.length > 0 ? `<br/><span>Sources: ${sourceTrace.join(' | ')}</span>` : '')
        + (recommendation ? `<br/><span>Action: ${recommendation}</span>` : ''),
        {
          direction: 'top',
          opacity: 0.92,
          sticky: true,
        },
      )
      globalEventDots.push(eventDot)
      globalEventDotProfiles.push({
        dot: eventDot,
        baseRadius,
        severityFactor: severityScale(alert.severity),
        phase: Math.random() * Math.PI * 2,
        category,
      })

      if (!node) continue

      const ring = L.circleMarker([node.lat, node.lng], {
        radius: 10,
        color: alert.severity === 'CRITICAL' || alert.severity === 'EMERGENCY' ? config.colors.critical : alert.severity === 'WARNING' ? config.colors.degraded : config.colors.wireframe,
        fillOpacity: 0,
        opacity: 0.85,
        weight: 1.2,
        className: 'surveillance-alert-ring',
      }).addTo(alertLayer)
      alertsRings.push(ring)
      alertRingProfiles.push({ ring, baseRadius: 10, phase: (node.lat * 0.05) + (node.lng * 0.03) })
    }

    applyGlobalEventDotSizing(audioReactiveBands.pulse, audioReactiveBands.transient, audioReactiveBands.flux)

    if (!hasInitialBounds) {
      map.fitBounds(WORLD_BOUNDS, { padding: [8, 8], animate: true, duration: 0.6 })
      hasInitialBounds = true
      emitViewportChange()
    }

    const focusedNode = focusedNodeId ? nodeById.get(focusedNodeId) : undefined
    if (focusedNode && focusedNodeId !== lastFocusedNodeId) {
      map.panTo([focusedNode.lat, focusedNode.lng], { animate: true, duration: 0.7 })
      lastFocusedNodeId = focusedNodeId
      hasInitialBounds = true
      emitViewportChange()
    }

    if (!focusedNodeId) {
      lastFocusedNodeId = undefined
    }
  }

  const setAltitude = (altitude: number) => {
    forceFullSize()
    const minOperationalZoom = minViewportZoom
    const maxOperationalZoom = Math.max(minOperationalZoom, Math.max(config.maxZoom, 18))
    const zoom = Math.round(minOperationalZoom + ((100 - altitude) / 100) * (maxOperationalZoom - minOperationalZoom))
    map.setZoom(Math.max(minOperationalZoom, Math.min(maxOperationalZoom, zoom)))
  }

  return {
    setData,
    setAltitude,
    setBasemap,
    setViewportChangeHandler: (handler?: (bbox: string) => void) => {
      viewportChangeHandler = handler
      if (handler) emitViewportChange()
    },
    setAudioReactive: (enabled: boolean, level = 0, bands?: AudioReactiveBands) => {
      audioReactiveEnabled = enabled
      audioReactiveLevel = clamp01(level)
      if (bands) {
        audioReactiveBands = {
          subBass: clamp01(bands.subBass ?? 0),
          bass: clamp01(bands.bass ?? 0),
          lowMid: clamp01(bands.lowMid ?? 0),
          mid: clamp01(bands.mid ?? 0),
          presence: clamp01(bands.presence ?? 0),
          treble: clamp01(bands.treble ?? 0),
          brilliance: clamp01(bands.brilliance ?? 0),
          flux: clamp01(bands.flux ?? 0),
          transient: clamp01(bands.transient ?? 0),
          centroid: clamp01(bands.centroid ?? 0),
          pulse: clamp01(bands.pulse ?? 0),
          beat: clamp01(bands.beat ?? 0),
        }
      } else if (!enabled) {
        audioReactiveBands = {
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
      }
    },
    setWireframesVisible: (visible: boolean) => {
      applyWireframeVisibility(visible)
    },
    getZoom: () => map.getZoom(),
    getViewportSpan: () => {
      const bounds = map.getBounds()
      const latSpan = Math.max(0, bounds.getNorth() - bounds.getSouth())
      const rawLngSpan = bounds.getEast() - bounds.getWest()
      const lngSpan = rawLngSpan >= 0 ? rawLngSpan : rawLngSpan + 360
      return { latSpan, lngSpan }
    },
    projectLatLng: (lat: number, lng: number) => {
      const point = map.latLngToContainerPoint([lat, wrapLongitude(lng)])
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
      return { x: point.x, y: point.y }
    },
    destroy: () => {
      window.clearInterval(octaneV7Timer)
      window.clearInterval(reactiveTimer)
      reactiveBursts.forEach((burst) => {
        burst.line.remove()
        burst.startDot.remove()
        burst.endDot.remove()
      })
      reactiveBursts.length = 0
      octaneV7Profiles.forEach((profile) => {
        profile.outer.remove()
        profile.inner.remove()
      })
      octaneV7Profiles.length = 0
      ambientAudioDots.forEach((entry) => {
        entry.dot.remove()
      })
      ambientAudioDots.length = 0
      globalEventDots.forEach((dot) => {
        dot.remove()
      })
      globalEventDots.length = 0
      globalEventDotProfiles.length = 0
      map.off('dragstart', markUserNavigation)
      map.off('zoomstart', markUserNavigation)
      map.off('zoomend', onZoomEndUpdateDots)
      map.off('moveend', emitViewportChange)
      map.off('zoomend', emitViewportChange)
      resizeObserver.disconnect()
      map.remove()
    },
  }
}