/**
 * OCTANE v5 — API Routes (Hono)
 * All inter-existential engine endpoints.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from '../types/index.js';
import { engineHandler }     from './handlers/engine.js';
import { srcHandler }        from './handlers/src.js';
import { cbeHandler }        from './handlers/cbe.js';
import { elxHandler }        from './handlers/elx.js';
import { oanHandler }        from './handlers/oan.js';
import { flowHandler }       from './handlers/flows.js';
import { governanceHandler } from './handlers/governance.js';
import { metricsHandler }    from './handlers/metrics.js';
import { surveillanceRouter } from './handlers/surveillance.js';
import { weatherRouter } from './handlers/weather.js';

export function createRouter(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.use('*', cors({ origin: '*', allowMethods: ['GET','POST','PUT','DELETE','OPTIONS'] }));

  // ── Health & Meta ─────────────────────────────────────────────
  app.get('/',         (c) => c.json({ engine: 'Octane v5', codename: 'STELLAR', version: '5.0.0', edition: 'Inter-Existential Engine', operator: 'Ionirix LLC' }));
  app.get('/health',   engineHandler.health);
  app.get('/metrics',  metricsHandler.all);
  app.get('/version',  engineHandler.version);

  // ── Engine Lifecycle ──────────────────────────────────────────
  app.post('/engine/ignite',    engineHandler.ignite);
  app.post('/engine/contain',   engineHandler.contain);
  app.get ('/engine/state',     engineHandler.state);
  app.get ('/engine/session',   engineHandler.session);
  app.get ('/engine/activation',engineHandler.activation);

  // ── SRC: Stellar Reach Conduit ────────────────────────────────
  app.get ('/src/state',           srcHandler.state);
  app.get ('/src/conduits',        srcHandler.conduits);
  app.get ('/src/bandwidth',       srcHandler.bandwidth);
  app.post('/src/reach',           srcHandler.reach);
  app.delete('/src/seal/:id',      srcHandler.seal);

  // ── CBE: Civilization Bridge Engine ──────────────────────────
  app.get ('/cbe/bridges',                cbeHandler.bridges);
  app.get ('/cbe/history',                cbeHandler.history);
  app.post('/cbe/bridge/open',            cbeHandler.openBridge);
  app.post('/cbe/translate',              cbeHandler.translate);
  app.delete('/cbe/bridge/seal/:id',      cbeHandler.sealBridge);
  app.get ('/cbe/bridge/:id',             cbeHandler.getBridge);

  // ── ELX: Existence Lattice ────────────────────────────────────
  app.post('/elx/write',          elxHandler.write);
  app.get ('/elx/node/:id',       elxHandler.read);
  app.delete('/elx/node/:id',     elxHandler.remove);
  app.post('/elx/query',          elxHandler.query);
  app.post('/elx/entangle',       elxHandler.entangle);
  app.get ('/elx/snapshot',       elxHandler.snapshot);
  app.get ('/elx/coherence',      elxHandler.coherence);

  // ── OAN: Operator Ascension Node ─────────────────────────────
  app.get ('/oan/stages',         oanHandler.stages);
  app.get ('/oan/stage/current',  oanHandler.currentStage);
  app.post('/oan/stage/advance',  oanHandler.advance);
  app.get ('/oan/oath',           oanHandler.oath);
  app.post('/oan/oath/sign',      oanHandler.signOath);
  app.post('/oan/decree',         oanHandler.issueDecree);
  app.get ('/oan/decrees',        oanHandler.decrees);
  app.post('/oan/ethics/check',   oanHandler.ethicsCheck);
  app.get ('/oan/ethics/log',     oanHandler.ethicsLog);

  // ── Flow Models ───────────────────────────────────────────────
  app.post('/flows/execute',              flowHandler.execute);
  app.get ('/flows',                      flowHandler.list);
  app.get ('/flows/active',               flowHandler.active);
  app.get ('/flows/:id',                  flowHandler.get);
  app.post('/flows/primary-signal',       flowHandler.primarySignal);
  app.post('/flows/inter-existential',    flowHandler.interExistential);
  app.post('/flows/emergency-containment',flowHandler.emergencyContainment);
  app.post('/flows/operator-ascension',   flowHandler.operatorAscension);

  // ── Governance ────────────────────────────────────────────────
  app.get ('/governance/charter',         governanceHandler.charter);
  app.get ('/governance/lifecycle',       governanceHandler.lifecycle);
  app.get ('/governance/access-policies', governanceHandler.policies);
  app.get ('/governance/decrees',         governanceHandler.decrees);
  app.post('/governance/decree',          governanceHandler.issueDecree);
  app.delete('/governance/decree/:id',    governanceHandler.revokeDecree);
  app.post('/governance/ethics/check',    governanceHandler.ethicsCheck);
  app.get ('/governance/ethics/log',      governanceHandler.ethicsLog);

  // ── v6 Surveillance ───────────────────────────────────────────
  app.route('/v6/surveillance', surveillanceRouter);
  app.route('/v6/weather', weatherRouter);

  return app;
}
