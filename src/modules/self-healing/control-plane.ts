import type { Env } from '../../types/index.js'

type ControlPlaneDomain = 'dns' | 'cdn' | 'load-balancer' | 'incident'

type DomainConfig = {
  endpoint?: string
  token?: string
}

type AdapterExecutionInput = {
  operationId: string
  playbookId: string
  nodeId: string
  nodeName: string
  reason: string
  actions: string[]
  actor: string
}

export type AdapterExecutionResult = {
  domain: ControlPlaneDomain
  ok: boolean
  statusCode?: number
  detail: string
}

const PLAYBOOK_DOMAINS: Record<string, ControlPlaneDomain[]> = {
  'playbook-route-failover': ['load-balancer', 'cdn'],
  'playbook-dns-reconcile': ['dns'],
  'playbook-incident-isolation': ['incident', 'load-balancer'],
}

function configForDomain(env: Env, domain: ControlPlaneDomain): DomainConfig {
  if (domain === 'dns') {
    return { endpoint: env.SELF_HEALING_DNS_ENDPOINT, token: env.SELF_HEALING_DNS_TOKEN }
  }
  if (domain === 'cdn') {
    return { endpoint: env.SELF_HEALING_CDN_ENDPOINT, token: env.SELF_HEALING_CDN_TOKEN }
  }
  if (domain === 'load-balancer') {
    return { endpoint: env.SELF_HEALING_LB_ENDPOINT, token: env.SELF_HEALING_LB_TOKEN }
  }
  return { endpoint: env.SELF_HEALING_INCIDENT_ENDPOINT, token: env.SELF_HEALING_INCIDENT_TOKEN }
}

async function executeDomainCall(
  domain: ControlPlaneDomain,
  config: DomainConfig,
  input: AdapterExecutionInput,
): Promise<AdapterExecutionResult> {
  if (!config.endpoint) {
    return {
      domain,
      ok: false,
      detail: `No endpoint configured for ${domain}.`,
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Octane-Operation-Id': input.operationId,
    'X-Octane-Actor': input.actor,
  }

  if (config.token) headers.Authorization = `Bearer ${config.token}`

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'self-healing-remediation',
        domain,
        operationId: input.operationId,
        playbookId: input.playbookId,
        nodeId: input.nodeId,
        nodeName: input.nodeName,
        reason: input.reason,
        actions: input.actions,
        initiatedBy: input.actor,
        timestamp: Date.now(),
      }),
    })

    return {
      domain,
      ok: response.ok,
      statusCode: response.status,
      detail: response.ok
        ? `${domain} adapter accepted operation ${input.operationId}`
        : `${domain} adapter rejected operation ${input.operationId}`,
    }
  } catch (error) {
    return {
      domain,
      ok: false,
      detail: error instanceof Error ? error.message : `Failed to reach ${domain} adapter.`,
    }
  }
}

export async function executeOperationViaControlPlane(
  env: Env,
  input: AdapterExecutionInput,
): Promise<{ ok: boolean; results: AdapterExecutionResult[] }> {
  const domains = PLAYBOOK_DOMAINS[input.playbookId] ?? ['incident']
  const results = await Promise.all(
    domains.map((domain) => executeDomainCall(domain, configForDomain(env, domain), input)),
  )
  return {
    ok: results.every((result) => result.ok),
    results,
  }
}
