import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  VINABOT_CREDENTIAL_REF,
  STATUS_PATH,
  VINABOT_PROVIDER,
  VINABOT_SETTINGS_NAMESPACE,
  VinabotIntegration,
  normalizeApiKey,
  normalizeModels,
  protocolsOfModel
} from '../packages/dsh-desktop-vinabot/index.js'

interface FakeContext {
  settings: {
    get: (namespace: string) => unknown
    mutate: (namespace: string, operations: Array<{ op: string; path: string[]; value?: unknown }>) => Promise<void>
  }
  credentials: {
    describe: () => Promise<{ configured: boolean; writable: boolean }>
    set: (_ref: unknown, value: string) => Promise<void>
  }
  agentDefaultModel: {
    currentSelection: () => { provider: string; model: string }
    saveSelection: (selection: { provider: string; model: string }) => Promise<void>
  }
}

function fakeContext(): FakeContext & {
  section: { providers: Record<string, unknown> }
  secret?: string
  selection: { provider: string; model: string }
} {
  const context = {
    section: { providers: {} as Record<string, unknown> },
    secret: undefined as string | undefined,
    selection: { provider: 'deepseek-official', model: 'deepseek-chat' },
    settings: {
      get(namespace: string) {
        expect(namespace).toBe(VINABOT_SETTINGS_NAMESPACE)
        return context.section
      },
      async mutate(
        namespace: string,
        operations: Array<{ op: string; path: string[]; value?: unknown }>
      ) {
        expect(namespace).toBe(VINABOT_SETTINGS_NAMESPACE)
        for (const operation of operations) {
          expect(operation.path).toEqual(['providers', VINABOT_PROVIDER])
          if (operation.op === 'set') context.section.providers[VINABOT_PROVIDER] = operation.value
          if (operation.op === 'unset') delete context.section.providers[VINABOT_PROVIDER]
        }
      }
    },
    credentials: {
      async describe() {
        return { configured: context.secret !== undefined, writable: true }
      },
      async set(_ref: unknown, value: string) {
        context.secret = value
      }
    },
    agentDefaultModel: {
      currentSelection() {
        return context.selection
      },
      async saveSelection(selection: { provider: string; model: string }) {
        context.selection = selection
      }
    }
  }
  return context
}

function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, init)
}

describe('VinaRouter model normalization', () => {
  it('prefixes raw NewAPI keys exactly once', () => {
    expect(normalizeApiKey('abc')).toBe('sk-abc')
    expect(normalizeApiKey(' sk-abc ')).toBe('sk-abc')
    expect(() => normalizeApiKey('')).toThrow(/API 密钥/u)
  })

  it('keeps only OpenAI-compatible text models and deduplicates IDs', () => {
    expect(protocolsOfModel({ supported_endpoint_types: ['openai', 'openai-response'] })).toEqual([
      'openai-completions',
      'openai-responses'
    ])
    expect(normalizeModels({
      data: [
        { id: 'chat-model', name: 'Chat', supported_endpoint_types: ['openai'] },
        { id: 'response-model', supported_endpoint_types: ['openai-response'] },
        { id: 'image-model', supported_endpoint_types: ['image-generation'] },
        { id: 'chat-model', supported_endpoint_types: ['openai'] }
      ]
    })).toEqual([
      { id: 'chat-model', name: 'Chat', protocols: ['openai-completions'] },
      { id: 'response-model', name: 'response-model', protocols: ['openai-responses'] }
    ])
  })
})

describe('VinaRouter setup flow', () => {
  it('logs in, provisions a device token, stores it Host-side, and selects the model', async () => {
    const context = fakeContext()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    let searchCount = 0
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url)
      calls.push({ url: href, init })
      const path = new URL(href).pathname
      if (path === '/api/status') return json({ success: true, data: { turnstile_check: false } })
      if (path === '/api/user/login') {
        expect(JSON.parse(String(init?.body))).toEqual({ username: 'alice', password: 'secret' })
        return json({
          success: true,
          data: {
            access_token: 'panel-token',
            session: { sid: 'panel-session' },
            user: { display_name: 'Alice' }
          }
        })
      }
      if (path === '/api/token/search') {
        searchCount += 1
        return json({
          success: true,
          data: {
            items: searchCount === 1
              ? []
              : [{ id: 41, name: 'dsh-desktop-12345678', status: 1 }]
          }
        })
      }
      if (path === '/api/token/') {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          name: 'dsh-desktop-12345678',
          unlimited_quota: true,
          model_limits_enabled: false
        })
        return json({ success: true })
      }
      if (path === '/api/token/41/key') {
        return json({ success: true, data: { key: 'raw-model-key' } })
      }
      if (path === '/v1/models') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-raw-model-key')
        return json({
          success: true,
          data: [
            { id: 'chat-a', supported_endpoint_types: ['openai'] },
            { id: 'both-b', name: 'Both B', supported_endpoint_types: ['openai', 'openai-response'] },
            { id: 'response-c', supported_endpoint_types: ['openai-response'] },
            { id: 'image-d', supported_endpoint_types: ['image-generation'] }
          ]
        })
      }
      if (path === '/api/user/auth/logout') return json({ success: true })
      throw new Error(`Unexpected request: ${href}`)
    })
    const integration = new VinabotIntegration(context, {
      fetchImpl,
      anonymousId: '12345678-1234-1234-1234-123456789abc',
      randomUUID: () => 'flow-1'
    })

    const login = await integration.login({ username: 'alice', password: 'secret' })
    expect(login).toEqual({
      ok: true,
      stage: 'models',
      flowId: 'flow-1',
      displayName: 'Alice',
      models: [
        { id: 'chat-a', name: 'chat-a', protocols: ['openai-completions'] },
        { id: 'both-b', name: 'Both B', protocols: ['openai-completions', 'openai-responses'] },
        { id: 'response-c', name: 'response-c', protocols: ['openai-responses'] }
      ]
    })
    expect(JSON.stringify(login)).not.toContain('panel-token')
    expect(JSON.stringify(login)).not.toContain('raw-model-key')

    const configured = await integration.configure({
      flowId: 'flow-1',
      model: 'both-b',
      protocol: 'auto'
    })
    expect(configured).toMatchObject({
      ok: true,
      configured: true,
      provider: VINABOT_PROVIDER,
      model: 'both-b',
      protocol: 'openai-completions',
      modelCount: 2
    })
    expect(context.secret).toBe('sk-raw-model-key')
    expect(context.selection).toEqual({ provider: VINABOT_PROVIDER, model: 'both-b' })
    expect(context.section.providers[VINABOT_PROVIDER]).toEqual({
      displayName: 'VinaRouter',
      apiKeyEnv: VINABOT_CREDENTIAL_REF,
      api: 'openai-completions',
      baseURL: 'https://router.vinabot.ai/v1',
      models: [{ id: 'chat-a' }, { id: 'both-b', name: 'Both B' }]
    })
    expect(calls.some((call) => new URL(call.url).pathname === '/api/user/auth/logout')).toBe(true)

    await expect(integration.status()).resolves.toMatchObject({
      configured: true,
      credentialConfigured: true,
      protocol: 'openai-completions',
      selected: { provider: VINABOT_PROVIDER, model: 'both-b' }
    })
  })

  it('keeps a two-factor flow secret and supports cancellation', async () => {
    const context = fakeContext()
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname
      if (path === '/api/status') return json({ success: true, data: { turnstile_check: false } })
      if (path === '/api/user/login') {
        return json({ success: true, data: { require_2fa: true, flow_token: 'private-2fa-token' } })
      }
      throw new Error(`Unexpected request: ${String(url)}`)
    })
    const integration = new VinabotIntegration(context, {
      fetchImpl,
      anonymousId: '12345678-1234-1234-1234-123456789abc',
      randomUUID: () => 'flow-2fa'
    })

    const result = await integration.login({ username: 'alice', password: 'secret' })
    expect(result).toEqual({ ok: true, stage: '2fa', flowId: 'flow-2fa' })
    expect(JSON.stringify(result)).not.toContain('private-2fa-token')
    await expect(integration.cancel({ flowId: 'flow-2fa' })).resolves.toEqual({ ok: true })
  })

  it('chooses Responses automatically for a Responses-only model', async () => {
    const context = fakeContext()
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname
      if (path === '/api/status') return json({ success: true, data: { turnstile_check: false } })
      if (path === '/api/user/login') {
        return json({ success: true, data: { access_token: 'panel', session: {}, user: {} } })
      }
      if (path === '/api/token/search') {
        return json({ success: true, data: { items: [{ id: 1, name: 'dsh-desktop-12345678', status: 1 }] } })
      }
      if (path === '/api/token/1/key') return json({ success: true, data: { key: 'key' } })
      if (path === '/v1/models') {
        return json({ success: true, data: [{ id: 'o3-only', supported_endpoint_types: ['openai-response'] }] })
      }
      if (path === '/api/user/auth/logout') return json({ success: true })
      throw new Error(`Unexpected request: ${String(url)}`)
    })
    const integration = new VinabotIntegration(context, {
      fetchImpl,
      anonymousId: '12345678-1234-1234-1234-123456789abc',
      randomUUID: () => 'flow-response'
    })
    await integration.login({ username: 'alice', password: 'secret' })

    await expect(integration.configure({
      flowId: 'flow-response',
      model: 'o3-only',
      protocol: 'auto'
    })).resolves.toMatchObject({ protocol: 'openai-responses' })
    expect(context.section.providers[VINABOT_PROVIDER]).toMatchObject({
      api: 'openai-responses',
      models: [{ id: 'o3-only' }]
    })
  })
})

describe('VinaRouter package wiring', () => {
  it('mounts the Host plugin and exposes setup and settings client surfaces', async () => {
    const root = join(import.meta.dirname, '..')
    const [composition, host, client, manifest, dshPatch] = await Promise.all([
      readFile(join(root, 'build', 'dsh-desktop.patch.yml'), 'utf8'),
      readFile(join(root, 'packages', 'dsh-desktop-vinabot', 'index.js'), 'utf8'),
      readFile(join(root, 'packages', 'dsh-desktop-vinabot', 'client.js'), 'utf8'),
      readFile(join(root, 'package.json'), 'utf8'),
      readFile(join(root, 'patches', '@deepseek-ai+dsh+0.1.5-rc.1.patch'), 'utf8')
    ])
    expect(composition).toContain('name: dsh-desktop-vinabot')
    expect(JSON.parse(manifest).dependencies['dsh-desktop-vinabot']).toBe(
      'file:packages/dsh-desktop-vinabot'
    )
    expect(dshPatch).toContain('"dsh-desktop-vinabot": "0.1.0"')
    expect(STATUS_PATH).toBe('/api/dsh-desktop/vinabot/status')
    expect(host).toContain("requestBody: 'buffered'")
    expect(client).toContain("const STATUS_PATH = '/api/dsh-desktop/vinabot/status'")
    expect(client).toContain("ctx.slots.inject('settings.onboarding'")
    expect(client).toContain("ctx.slots.inject('settings.section'")
    expect(client).not.toContain('VINABOT_API_KEY')
  })
})
