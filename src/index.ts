/**
 * OCTANE v5 — The Inter-Existential Engine
 * Cloudflare Worker Entry Point
 * STELLAR Edition | OCTANE-V5.0.0-STELLAR
 * Operator: Mirnes — Sovereign Architect
 * © 2026 Ionirix LLC — All Rights Reserved
 */
import { Env } from './types/index.js';
import { createRouter } from './api/routes.js';

// Re-export Durable Objects for Cloudflare Workers binding
export { StellarReachConduitDO }   from './workers/stellar-reach-conduit-do.js';
export { CivilizationBridgeEngineDO } from './workers/civilization-bridge-engine-do.js';
export { ExistenceLatticeDO }      from './workers/existence-lattice-do.js';
export { OperatorAscensionNodeDO } from './workers/operator-ascension-node-do.js';
export { OrchestrationFeedDO }     from './workers/orchestration-feed-do.js';
export { SurveillanceDO }          from './workers/surveillance-do.js';

const app = createRouter();

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const NO_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

const API_ROUTE_PREFIXES = [
  '/health', '/metrics', '/version',
  '/engine/', '/src/', '/cbe/', '/elx/', '/oan/', '/flows/', '/governance/',
  '/api/', '/v6/', '/v7/', '/ws/',
];

function isStaticAssetPath(pathname: string): boolean {
  if (pathname === '/') return true;
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  return !API_ROUTE_PREFIXES.some((prefix) => (
    pathname === prefix || pathname.startsWith(prefix)
  ));
}

function hasFileExtension(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function buildAISystemPrompt(context?: Record<string, unknown>): string {
  const contextBlock = context
    ? `\n\nRuntime context:\n${JSON.stringify(context, null, 2)}`
    : '';

  return [
    'You are Ion AI for Octane, a highly capable assistant running on Cloudflare Workers AI.',
    'Answer the user request directly and accurately.',
    'Use Octane platform context only when relevant.',
  ].join(' ') + contextBlock;
}

async function handleAIInference(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const {
      messages,
      message,
      prompt,
      context,
      model,
      temperature = 0.7,
      topP = 0.9,
      topK = 40,
      maxTokens = 1024,
    } = body;

    const promptText = String(message || prompt || '').trim();
    const normalizedMessages = Array.isArray(messages)
      ? messages
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
          .map((entry) => ({
            role: String(entry.role || 'user'),
            content: String(entry.content || ''),
          }))
          .filter((entry) => entry.content.trim().length > 0)
          .slice(-20)
      : [];

    const msgs = normalizedMessages.length > 0
      ? normalizedMessages
      : promptText
        ? [{ role: 'user', content: promptText }]
        : [];

    if (msgs.length === 0) {
      return json({ error: 'message or messages required' }, 400);
    }

    const aiResponse = await env.AI.run(String(model || '@cf/meta/llama-3.1-8b-instruct'), {
      messages: [{
        role: 'system',
        content: buildAISystemPrompt(context && typeof context === 'object' ? context as Record<string, unknown> : undefined),
      }, ...msgs],
      temperature: Math.min(2.0, Number(temperature)),
      top_p: Math.min(0.99, Number(topP)),
      top_k: Math.min(100, Number(topK)),
      max_tokens: Math.min(4096, Number(maxTokens)),
      stream: false,
    });

    if (aiResponse && typeof aiResponse === 'object') {
      const payload = aiResponse as Record<string, unknown>;
      const content = payload.response ?? payload.content ?? payload.text;
      if (typeof content === 'string' && content.trim()) {
        return json({
          role: 'assistant',
          content,
          model: String(model || '@cf/meta/llama-3.1-8b-instruct'),
          ts: Date.now(),
        });
      }
    }

    return json({ error: 'AI returned an empty response' }, 502);
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
}

async function handleImageGeneration(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const {
      prompt,
      negative_prompt,
      negative,
      num_steps,
      steps,
      guidance,
      cfg_scale,
      width = 1024,
      height = 1024,
      seed,
      model,
    } = body;

    if (!String(prompt || '').trim()) {
      return json({ error: 'prompt required' }, 400);
    }

    const selectedModel = String(model || '@cf/stabilityai/stable-diffusion-xl-base-1.0');
    const runInputs: Record<string, unknown> = {
      prompt: String(prompt),
      negative_prompt: String(negative_prompt || negative || ''),
      num_steps: Math.min(20, Number(num_steps ?? steps ?? 20)),
      guidance: Number(guidance ?? cfg_scale ?? 7.5),
      width: Number(width),
      height: Number(height),
    };

    if (seed !== undefined) runInputs.seed = Number(seed);

    const result = await env.AI.run(selectedModel, runInputs);

    if (result instanceof ReadableStream) {
      return new Response(result, { headers: { 'Content-Type': 'image/png', ...CORS_HEADERS } });
    }

    if (result instanceof ArrayBuffer || ArrayBuffer.isView(result)) {
      return new Response(result as BodyInit, { headers: { 'Content-Type': 'image/png', ...CORS_HEADERS } });
    }

    if (result && typeof result === 'object' && 'image' in (result as Record<string, unknown>)) {
      const b64 = String((result as Record<string, unknown>).image || '');
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Response(bytes, { headers: { 'Content-Type': 'image/png', ...CORS_HEADERS } });
    }

    return json({ error: 'Unexpected image response format from AI binding' }, 500);
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
}

function remapLegacyApiPath(pathname: string): string {
  if (!pathname.startsWith('/api/')) return pathname;
  const mapped = pathname.slice(4);
  return mapped.length === 0 ? '/' : mapped;
}

// Scheduled tasks — periodic lattice re-coherence
const scheduled: ExportedHandlerScheduledHandler<Env> = async (_event, env, _ctx) => {
  // Trigger lattice recohere via ELX DO
  const stub = env.ELX_LATTICE.get(env.ELX_LATTICE.idFromName('global'));
  await stub.fetch('http://do/coherence');
};

export default {
  fetch: async (request, env, ctx) => {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (pathname === '/orchestration.html') {
      return Response.redirect(new URL('/orchestration', request.url), 302)
    }

    if (pathname === '/surveillance.html') {
      return Response.redirect(new URL('/surveillance', request.url), 302)
    }

    if (pathname === '/surveillance' && request.method === 'GET') {
      const response = await env.ASSETS.fetch(new Request(new URL('/', request.url).toString(), request));
      const headers = new Headers(response.headers);
      Object.entries(NO_CACHE_HEADERS).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    if (pathname === '/api/ai' && request.method === 'POST') {
      return handleAIInference(request, env);
    }

    if (pathname === '/api/imagegen' && request.method === 'POST') {
      return handleImageGeneration(request, env);
    }

    if (pathname === '/ws/orchestration') {
      const id = env.ORCHESTRATION_FEED.idFromName('global');
      const obj = env.ORCHESTRATION_FEED.get(id);
      return obj.fetch(request);
    }

    if (pathname.startsWith('/api/')) {
      const nextUrl = new URL(request.url);
      nextUrl.pathname = remapLegacyApiPath(pathname);
      const remappedRequest = new Request(nextUrl.toString(), request);
      return app.fetch(remappedRequest, env, ctx);
    }

    if (isStaticAssetPath(pathname)) {
      const shouldServeSpaShell = request.method === 'GET' && !hasFileExtension(pathname);
      const assetRequest = shouldServeSpaShell
        ? new Request(new URL('/', request.url).toString(), request)
        : request;

      const response = await env.ASSETS.fetch(assetRequest);
      if (shouldServeSpaShell || pathname === '/orchestration') {
        const headers = new Headers(response.headers);
        Object.entries(NO_CACHE_HEADERS).forEach(([key, value]) => headers.set(key, value));
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      return response;
    }

    return app.fetch(request, env, ctx);
  },
  scheduled,
} satisfies ExportedHandler<Env>;
