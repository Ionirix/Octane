/**
 * OCTANE v6 - Surveillance Durable Object
 */

import { DurableObject } from 'cloudflare:workers';
import { SurveillanceSystem } from '../subsystems/surveillance/index.js';
import type { Env, SurveillanceAlert } from '../types/index.js';
import { errorResponse, jsonResponse } from '../utils/helpers.js';
import { runSelfHealingCycle, type DisturbanceSignal } from '../modules/self-healing/protocol.js';

const HEALING_COOLDOWN_MS = 90_000;
const HEALING_MARKER_PREFIX = 'self-healing:peace-marker:';

export class SurveillanceDO extends DurableObject {
  private system: SurveillanceSystem;
  private runtimeEnv: Env;
  private recentlyHealed = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.runtimeEnv = env;
    this.system = new SurveillanceSystem();
  }

  private selectHealingCandidate(alerts: SurveillanceAlert[]): SurveillanceAlert | null {
    if (alerts.length === 0) return null;

    const rank = { EMERGENCY: 4, CRITICAL: 3, WARNING: 2, INFO: 1 };
    const critical = alerts.find((alert) => !alert.resolved && rank[alert.severity] >= 3);
    if (critical) return critical;

    if (alerts.length >= 10) {
      return alerts.find((alert) => !alert.resolved && rank[alert.severity] >= 2) ?? null;
    }

    return null;
  }

  private buildSignal(alert: SurveillanceAlert): DisturbanceSignal {
    const severityJitter = {
      EMERGENCY: 0.92,
      CRITICAL: 0.82,
      WARNING: 0.58,
      INFO: 0.26,
    } as const;

    const severityDrift = {
      EMERGENCY: 0.92,
      CRITICAL: 0.76,
      WARNING: 0.5,
      INFO: 0.22,
    } as const;

    return {
      source: `surveillance:${alert.type.toLowerCase()}`,
      summary: `${alert.title} (${alert.severity}) - ${alert.description}`,
      telemetrySpike: alert.severity !== 'INFO',
      degradedSubsystem: alert.serverId ? `Server:${alert.serverId}` : undefined,
      operatorFlagged: false,
      routingMismatch: alert.type === 'TRAFFIC',
      coherenceDriftScore: alert.type === 'SERVICE' || alert.type === 'GEOPOLITICAL'
        ? severityDrift[alert.severity]
        : undefined,
      emotionalVariance: alert.type === 'SECURITY' || alert.type === 'POLICE'
        ? 0.64
        : 0.32,
      jitterScore: severityJitter[alert.severity],
      recovering: false,
      metadata: {
        alertId: alert.id,
        alertType: alert.type,
        severity: alert.severity,
        serverId: alert.serverId,
      },
    };
  }

  private async persistPeaceMarker(
    alert: SurveillanceAlert,
    run: ReturnType<typeof runSelfHealingCycle>,
  ): Promise<void> {
    const createdAt = Date.now();
    const key = `${HEALING_MARKER_PREFIX}${createdAt}:${run.execution.resolveMarker}`;

    const record = {
      marker: run.execution.resolveMarker,
      createdAt,
      source: run.capture.storyFrame.whatItAffected,
      disturbanceType: run.capture.disturbanceType,
      modality: run.plot.modality,
      converged: run.resolve.converged,
      triggerAlertId: alert.id,
      summary: run.capture.storyFrame.whatHappened,
    };

    await this.runtimeEnv.OPERATOR_STATE_KV.put(key, JSON.stringify(record));
    await this.runtimeEnv.OPERATOR_STATE_KV.put('self-healing:last', JSON.stringify(record));
  }

  private async tryAutoHealFromAlerts(alerts: SurveillanceAlert[]): Promise<void> {
    const now = Date.now();
    this.recentlyHealed.forEach((value, key) => {
      if (now - value > HEALING_COOLDOWN_MS) this.recentlyHealed.delete(key);
    });

    const candidate = this.selectHealingCandidate(alerts);
    if (!candidate) return;

    const fingerprint = `${candidate.id}:${candidate.severity}`;
    const lastHealedAt = this.recentlyHealed.get(fingerprint);
    if (lastHealedAt && (now - lastHealedAt) < HEALING_COOLDOWN_MS) return;

    this.recentlyHealed.set(fingerprint, now);
    const signal = this.buildSignal(candidate);
    const run = runSelfHealingCycle(signal);
    if (!run.resolve.converged) return;

    await this.persistPeaceMarker(candidate, run);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace('/surveillance', '');

    try {
      if (request.method === 'GET' && path === '/snapshot') {
        return jsonResponse({ success: true, data: this.system.getSnapshot(), timestamp: Date.now() });
      }

      if (request.method === 'GET' && path === '/nodes') {
        return jsonResponse({ success: true, data: this.system.getAllNodes(), timestamp: Date.now() });
      }

      if (request.method === 'GET' && path === '/alerts') {
        const onlyActive = url.searchParams.get('onlyActive') !== 'false';
        const alerts = this.system.getUnifiedAlerts(onlyActive);
        await this.tryAutoHealFromAlerts(alerts);
        return jsonResponse({ success: true, data: alerts, timestamp: Date.now() });
      }

      if (request.method === 'POST' && path === '/alerts') {
        const alert = await request.json() as Omit<SurveillanceAlert, 'id' | 'timestamp' | 'resolved'>;
        const id = this.system.addAlert(alert);
        return jsonResponse({ success: true, data: { id }, timestamp: Date.now() }, 201);
      }

      return errorResponse('Unknown endpoint', 404);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Surveillance error', 500);
    }
  }
}