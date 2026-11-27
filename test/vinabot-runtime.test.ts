import { createRequire } from 'node:module'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

import { CONFIGURE_PATH, LOGIN_PATH, STATUS_PATH, VINABOT_PROVIDER } from '../packages/dsh-desktop-vinabot/index.js'
import { DesktopHostProcess } from '../src/main/shell/backend/host-process'
import { ensureHostBundle, hostBundle } from './host/host-bundle-helper'

it('configures all VinaRouter protocols and retains High after a Harness 0.2.2 restart', async () => {
  const root = resolve(import.meta.dirname, '..')
  const home = await mkdtemp(join(tmpdir(), 'dsh-vinabot-runtime-'))
  const profile = join(home, 'profiles', 'desktop')
  const patch = join(home, 'vinabot.patch.yml')
  const relayStub = join(home, 'relay-stub.mjs')
  const relayReady = join(home, 'relay-active')
  const capabilityProbe = join(home, 'capability-probe.mjs')
  await ensureHostBundle()
  let host: DesktopHostProcess | undefined
  let endpoint = ''
  const runtime = {
    async start() {
      await rm(relayReady, { force: true })
      host = new DesktopHostProcess({
        node: createRequire(import.meta.url)('electron') as string,
        entry: hostBundle, runtimeDir: root, projectDir: profile,
        dshHome: home, profile: 'desktop',
        environment: { DSH_DESKTOP_PATCH_FILE: patch, NODE_OPTIONS: `--import=${pathToFileURL(relayStub).href}` },
        primaryRuntime: join(home, 'unused-runtime')
      })
      endpoint = (await host.start()).url
      await access(relayReady)
    },
    snapshot() { return { phase: 'ready', logs: [] as string[], url: new URL(endpoint).origin, authToken: new URL(endpoint).searchParams.get('token') } },
    async stop() { await host?.stop() }
  }
  try {
    await mkdir(profile, { recursive: true })
    await writeFile(join(profile, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop', private: true, dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } }
    }))
    await writeFile(join(profile, 'cordis.yml'), '[]\n')
    await writeFile(join(profile, 'cordis.patch.yml'), '[]\n')
    const hmr = process.platform === 'win32' ? '- id: hmr\n  disabled: true\n' : ''
    await writeFile(patch, `${hmr}- id: desktop-product-telemetry
  disabled: true
- id: product-analytics
  disabled: true
- insert:
    - id: dsh-desktop-vinabot
      name: dsh-desktop-vinabot
    - id: capability-probe
      name: ${pathToFileURL(capabilityProbe).href}
`)
    await writeFile(capabilityProbe, `
export const inject = ['connection', 'settings', 'llm'];
export function apply(ctx) {
  ctx.connection.fetch.register({ path: '/api/fixture/add-model', methods: ['POST'], requestBody: 'buffered', fetch: async () => {
    const descriptor = ctx.settings.describe().find(entry => entry.ns === 'llm-pi-ai');
    const profile = descriptor.value.providers.vinabot;
    await ctx.settings.mutate('llm-pi-ai', [{op:'set', path:['providers','vinabot','models'], value:[...profile.models, {id:'gpt-6.1-sol'}]}], descriptor.revision);
    return Response.json({ok:true});
  }});
  ctx.connection.fetch.register({ path: '/api/fixture/model', methods: ['GET'], requestBody: 'buffered', fetch: async () => {
    try { return Response.json(await ctx.llm.resolveModelInfo('vinabot', 'gpt-6.1-sol')); }
    catch(error) { return Response.json({error:error.message, code:error.code}, {status:500}); }
  }});
  ctx.connection.fetch.register({ path: '/api/fixture/dispatch', methods: ['POST'], requestBody: 'buffered', fetch: async () => {
    const chunks = [];
    for await (const chunk of ctx.llm.stream({provider:'vinabot', model:'gpt-6.1-sol', reasoningEffort:'high', messages:[{role:'user',content:[{type:'text',text:'fixture'}]}]})) chunks.push(chunk);
    return Response.json({request:globalThis.__vinabotRequest, chunks});
  }});
}
`)
    await writeFile(relayStub, `
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./relay-active', import.meta.url), 'ready');
let realFetch = globalThis.fetch;
let tokenName;
const relayFetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin !== 'https://router.vinabot.ai') return realFetch(input, init);
  const json = (data) => Response.json({ success: true, data });
  if (url.pathname === '/api/status') return json({ turnstile_check: false });
  if (url.pathname === '/api/user/login') return json({ access_token: 'fixture-panel', session: {}, user: { display_name: 'Fixture' } });
  if (url.pathname === '/api/token/search') return json({ items: tokenName ? [{ id: 41, name: tokenName, status: 1 }] : [] });
  if (url.pathname === '/api/token/') {
    tokenName = JSON.parse(init.body).name;
    return json({});
  }
  if (url.pathname === '/api/token/41/key') return json({ key: 'fixture-key' });
  if (url.pathname === '/v1/models') return json([
    { id: 'gpt-5.6-sol', supported_endpoint_types: ['openai-response'] },
    { id: 'claude-fable-5', supported_endpoint_types: ['anthropic'] },
    { id: 'glm-5.3-flash', supported_endpoint_types: ['openai'] }
  ]);
  if (url.pathname === '/api/user/auth/logout') return json({});
  if (url.pathname === '/v1/responses') {
    const body = JSON.parse(init.body);
    globalThis.__vinabotRequest = {model:body.model, reasoning:body.reasoning};
    // A deliberate relay refusal proves dispatch passed the local capability
    // validator and serialized High; no real account or external API is used.
    return Response.json({error:{message:'fixture relay reached', type:'invalid_request_error'}}, {status:400});
  }
  throw new Error('Unexpected relay fixture path: ' + url.pathname);
};
// The profile's Undici globals can change after this Node preload runs.
Object.defineProperty(globalThis, 'fetch', {
  configurable: true, get: () => relayFetch,
  set: fetch => { if (fetch !== relayFetch) realFetch = fetch; }
});
`)
    await runtime.start()
    const snapshot = runtime.snapshot()
    expect(snapshot.phase, snapshot.logs.join('\n')).toBe('ready')
    if (!snapshot.url || !snapshot.authToken) throw new Error('Harness did not announce its authenticated endpoint')

    const login = await fetch(`${snapshot.url}/?token=${encodeURIComponent(snapshot.authToken)}`, { redirect: 'manual' })
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
    const response = await fetch(new URL(STATUS_PATH, snapshot.url), { headers: { Cookie: cookie } })
    expect(response.status, await response.clone().text()).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, configured: false })

    const request = async (path: string, payload: unknown) => {
      const result = await fetch(new URL(path, snapshot.url), {
        method: 'POST',
        headers: { Cookie: cookie, 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const body = await result.json()
      expect(result.status, JSON.stringify(body)).toBe(200)
      return body
    }
    const loginResult = await request(LOGIN_PATH, { username: 'fixture', password: 'fixture' })
    expect(loginResult).toMatchObject({ ok: true, stage: 'models' })
    const configured = await request(CONFIGURE_PATH, {
      flowId: loginResult.flowId,
      selections: [
        { model: 'gpt-5.6-sol', protocol: 'openai-responses' },
        { model: 'claude-fable-5', protocol: 'anthropic-messages' },
        { model: 'glm-5.3-flash', protocol: 'openai-completions' }
      ],
      defaultModel: 'gpt-5.6-sol'
    })
    expect(configured).toMatchObject({ ok: true, configured: true, provider: VINABOT_PROVIDER, modelCount: 3, providerCount: 3 })
    const after = await fetch(new URL(STATUS_PATH, snapshot.url), { headers: { Cookie: cookie } })
    expect(after.status, await after.clone().text()).toBe(200)
    await expect(after.json()).resolves.toMatchObject({
      ok: true,
      configured: true,
      credentialConfigured: true,
      selected: { provider: VINABOT_PROVIDER, model: 'gpt-5.6-sol', reasoningEffort: 'high' },
      models: expect.arrayContaining([
        expect.objectContaining({ id: 'gpt-5.6-sol', protocol: 'openai-responses' }),
        expect.objectContaining({ id: 'claude-fable-5', protocol: 'anthropic-messages' }),
        expect.objectContaining({ id: 'glm-5.3-flash', protocol: 'openai-completions' })
      ])
    })
    // Reproduce the generic settings page: append a model containing only id
    // while the route already has reasoning: high, then exercise boot repair.
    await request('/api/fixture/add-model', {})
    const beforeRepair = await request('/api/fixture/dispatch', {})
    expect(beforeRepair.request).toBeUndefined()
    expect(JSON.stringify(beforeRepair.chunks)).toContain('UNSUPPORTED_REASONING_EFFORT')
    await runtime.stop()
    await runtime.start()
    const restarted = runtime.snapshot()
    expect(restarted.phase, restarted.logs.join('\n')).toBe('ready')
    if (!restarted.url || !restarted.authToken) throw new Error('Harness restart did not announce its endpoint')
    const relogin = await fetch(`${restarted.url}/?token=${encodeURIComponent(restarted.authToken)}`, { redirect: 'manual' })
    const newCookie = relogin.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
    const restored = await fetch(new URL(STATUS_PATH, restarted.url), { headers: { Cookie: newCookie } })
    expect(restored.status, await restored.clone().text()).toBe(200)
    await expect(restored.json()).resolves.toMatchObject({
      ok: true,
      configured: true,
      credentialConfigured: true,
      selected: { provider: VINABOT_PROVIDER, model: 'gpt-5.6-sol', reasoningEffort: 'high' }
    })
    await expect.poll(async () => {
      const result = await fetch(new URL('/api/fixture/model', restarted.url), { headers: { Cookie: newCookie } })
      return result.json()
    }, { timeout: 5000 }).toMatchObject({
      id: 'gpt-6.1-sol', inputModalities: ['text', 'image'],
      reasoning: { defaultEffort: 'high', efforts: expect.arrayContaining([
        expect.objectContaining({ id: 'low' }), expect.objectContaining({ id: 'medium' }),
        expect.objectContaining({ id: 'high' }), expect.objectContaining({ id: 'xhigh' }), expect.objectContaining({ id: 'max' })
      ]) }
    })
    const dispatched = await fetch(new URL('/api/fixture/dispatch', restarted.url), {
      method: 'POST', headers: { Cookie: newCookie, 'content-type': 'application/json' }, body: '{}'
    })
    const dispatch = await dispatched.json()
    expect(dispatched.status, JSON.stringify(dispatch)).toBe(200)
    expect(dispatch).toMatchObject({ request: { model: 'gpt-6.1-sol', reasoning: { effort: 'high' } } })
    expect(JSON.stringify(dispatch)).not.toContain('UNSUPPORTED_REASONING_EFFORT')
  } finally {
    await runtime.stop()
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}, 120_000)
