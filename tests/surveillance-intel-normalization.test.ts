import { describe, expect, it } from 'vitest'
import { normalizeIntelBundle } from '../src/modules/surveillance/intel.js'

describe('surveillance intel normalization', () => {
  it('normalizes canonical entities from a mixed global payload', () => {
    const bundle = normalizeIntelBundle({
      generatedAt: 1_717_000_000,
      nodes: [
        {
          id: 'node-a',
          label: 'Node A',
          lat: 37.774929,
          lon: -122.419416,
          status: 'healthy',
          load: 73,
          region: 'West',
          country: 'United States',
        },
      ],
      subsystems: [
        {
          id: 'sub-a',
          label: 'Ingress Mesh',
          lat: 37.81,
          lon: -122.38,
          status: 'degraded',
          load: 0.62,
          nodeId: 'node-a',
        },
      ],
      flows: [
        {
          id: 'flow-a',
          fromId: 'node-a',
          toId: 'node-b',
          lat: 38,
          lon: -90,
          status: 'active',
          load: 0.44,
        },
      ],
      events: [
        {
          id: 'event-a',
          title: 'Transit congestion',
          lat: 40.712776,
          lon: -74.005974,
          status: 'warning',
          load: 0.86,
          ttlSeconds: 90,
        },
      ],
      geo: [
        {
          id: 'geo-a',
          label: 'North America',
          lat: 44.2,
          lon: -97.1,
          status: 'active',
          load: 0.3,
          radiusKm: 640,
        },
      ],
      metrics: {
        cpu: 0.51,
        memory: 64,
        p95Latency: 92,
      },
    })

    expect(bundle.nodes).toHaveLength(1)
    expect(bundle.subsystems).toHaveLength(1)
    expect(bundle.flows).toHaveLength(1)
    expect(bundle.events).toHaveLength(1)
    expect(bundle.geo).toHaveLength(1)
    expect(bundle.entities).toHaveLength(5)

    expect(bundle.nodes[0].lat).toBe(37.8)
    expect(bundle.nodes[0].lon).toBe(-122.4)
    expect(bundle.nodes[0].load).toBeCloseTo(0.73, 2)
    expect(bundle.events[0].severity).toBe('WARNING')
    expect(bundle.metrics.memory).toBeCloseTo(0.64, 2)
  })

  it('throws on malformed payload roots', () => {
    expect(() => normalizeIntelBundle('invalid')).toThrowError(/Invalid global intel payload shape/i)
  })

  it('supports nested data payloads', () => {
    const bundle = normalizeIntelBundle({
      data: {
        generatedAt: '2026-05-27T00:00:00.000Z',
        nodes: [
          {
            id: 'node-z',
            location: { lat: 51.507351, lng: -0.127758 },
            status: 'active',
            load: 41,
          },
        ],
      },
    })

    expect(bundle.nodes).toHaveLength(1)
    expect(bundle.nodes[0].lat).toBe(51.5)
    expect(bundle.nodes[0].lon).toBe(-0.1)
  })
})
