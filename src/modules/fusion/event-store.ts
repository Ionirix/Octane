import { create } from 'zustand'
import type { CanonicalFusedEvent, FusedFilter } from './types'

type FusedEventStore = {
  eventsById: Record<string, CanonicalFusedEvent>
  orderedIds: string[]
  filter: FusedFilter
  lastUpdatedAt: number | null
  setEvents: (events: CanonicalFusedEvent[]) => void
  setFilter: (patch: Partial<FusedFilter>) => void
  getFilteredEvents: () => CanonicalFusedEvent[]
}

function sortEvents(events: CanonicalFusedEvent[]): CanonicalFusedEvent[] {
  const rank = { critical: 4, high: 3, medium: 2, low: 1 }
  return [...events].sort((left, right) => {
    const priorityDelta = rank[right.priority] - rank[left.priority]
    if (priorityDelta !== 0) return priorityDelta
    const probabilityDelta = right.probability - left.probability
    if (probabilityDelta !== 0) return probabilityDelta
    return right.updatedAt - left.updatedAt
  })
}

export const useFusedEventStore = create<FusedEventStore>((set, get) => ({
  eventsById: {},
  orderedIds: [],
  filter: {
    category: 'all',
    severity: 'all',
    minConfidence: 0,
  },
  lastUpdatedAt: null,
  setEvents: (events) => {
    const sorted = sortEvents(events)
    const eventsById = sorted.reduce<Record<string, CanonicalFusedEvent>>((acc, event) => {
      acc[event.eventId] = event
      return acc
    }, {})

    set({
      eventsById,
      orderedIds: sorted.map((event) => event.eventId),
      lastUpdatedAt: Date.now(),
    })
  },
  setFilter: (patch) => set((state) => ({
    filter: {
      ...state.filter,
      ...patch,
    },
  })),
  getFilteredEvents: () => {
    const state = get()
    const events = state.orderedIds
      .map((id) => state.eventsById[id])
      .filter((event): event is CanonicalFusedEvent => Boolean(event))

    return events.filter((event) => {
      if (state.filter.region && state.filter.region !== 'all' && event.region !== state.filter.region) return false
      if (state.filter.category && state.filter.category !== 'all' && event.category !== state.filter.category) return false
      if (state.filter.severity && state.filter.severity !== 'all' && event.severity !== state.filter.severity) return false
      if ((state.filter.minConfidence ?? 0) > event.confidence) return false
      return true
    })
  },
}))
