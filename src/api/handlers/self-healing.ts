import { Hono } from 'hono';
import type { Env } from '../../types/index.js';
import { now, traceId } from '../../utils/helpers.js';
import { runSelfHealingCycle, type DisturbanceSignal } from '../../modules/self-healing/protocol.js';

type PeaceMarkerRecord = {
  marker: string;
  createdAt: number;
  source: string;
  disturbanceType: string;
  modality: string;
  converged: boolean;
  triggerAlertId?: string;
  summary: string;
};

const MARKER_PREFIX = 'self-healing:peace-marker:';

async function getRecentMarkers(env: Env, limit: number): Promise<PeaceMarkerRecord[]> {
  const boundedLimit = Math.max(1, Math.min(50, limit));
  const listing = await env.OPERATOR_STATE_KV.list({
    prefix: MARKER_PREFIX,
    limit: boundedLimit,
  });

  const records = await Promise.all(
    listing.keys.map(async (entry) => {
      const raw = await env.OPERATOR_STATE_KV.get(entry.name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as PeaceMarkerRecord;
      } catch {
        return null;
      }
    }),
  );

  return records
    .filter((entry): entry is PeaceMarkerRecord => Boolean(entry))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, boundedLimit);
}

export const selfHealingRouter = new Hono<{ Bindings: Env }>();

selfHealingRouter.post('/preview', async (c) => {
  const body = await c.req.json<DisturbanceSignal>();

  if (!body || typeof body.summary !== 'string' || typeof body.source !== 'string') {
    return c.json({
      success: false,
      error: 'source and summary are required',
      traceId: traceId(),
      timestamp: now(),
    }, 400);
  }

  const run = runSelfHealingCycle(body);
  return c.json({ success: true, data: run, traceId: traceId(), timestamp: now() });
});

selfHealingRouter.get('/markers', async (c) => {
  const requested = Number(c.req.query('limit') ?? '20');
  const markers = await getRecentMarkers(c.env, Number.isFinite(requested) ? requested : 20);

  return c.json({
    success: true,
    data: markers,
    traceId: traceId(),
    timestamp: now(),
  });
});

export default selfHealingRouter;
