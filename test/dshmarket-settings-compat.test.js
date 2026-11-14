import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { adaptMarketSettingsSources } from '../build/dshmarket-settings-compat.mjs'
import { DesktopHostProcess } from '../src/main/shell/backend/host-process'
import { ensureSafeModeProfile, SAFE_MODE_PROFILE } from '../src/main/recovery/safe-mode-profile'
import { ensureHostBundle, hostBundle } from './host/host-bundle-helper'
import { resolveTestNodeExecutable } from './node-executable'

const root = resolve(import.meta.dirname, '..')
const fixtures = join(import.meta.dirname, 'fixtures', 'dshmarket-settings')
const node = resolveTestNodeExecutable()
const sources = async () => Object.fromEntries(await Promise.all(['index.js', 'settings.js'].map(async (file) => [file, await readFile(join(fixtures, file), 'utf8')])))

it('refuses changed third-party code instead of applying a partial patch', async () => {
  const original = await sources()
  expect(() => adaptMarketSettingsSources({ ...original, 'settings.js': original['settings.js'] + '\n' })).toThrow('unexpected settings.js source')
  expect(original['index.js']).not.toContain('export const Config')
})

it.each([
  ['dshmarket', '1.69.1', false],
  ['unrelated-plugin', '1.69.0', false],
  ['dshmarket', '1.69.0', true]
])('leaves unknown/changed %s@%s on its original loading path', async (name, version, diagnostic) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-market-settings-boundary-'))
  try {
    await mkdir(join(home, 'lib'))
    await writeFile(join(home, 'package.json'), JSON.stringify({ name, version, type: 'module' }))
    await writeFile(join(home, 'lib/index.js'), 'export const original = true')
    await writeFile(join(home, 'lib/settings.js'), 'export const original = true')
    const result = spawnSync(node, ['--input-type=module', '-e', `
      import { registerMarketSettingsCompatibility } from ${JSON.stringify(pathToFileURL(join(root, 'build/dshmarket-settings-compat.mjs')).href)};
      registerMarketSettingsCompatibility(${JSON.stringify(join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js'))});
      const module = await import(${JSON.stringify(pathToFileURL(join(home, 'lib/index.js')).href)});
      if(module.original !== true || module.Config !== undefined) throw Error('unverified module was replaced');
    `], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr.includes('unexpected index.js source')).toBe(diagnostic)
    expect(result.stderr).not.toContain('applying verified Desktop settings adapter')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('keeps the legacy register path and disposes the modern presentation on unload', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-market-settings-unit-'))
  try {
    const adapted = adaptMarketSettingsSources(await sources())
    await mkdir(join(home, 'node_modules/@deepseek-ai'), { recursive: true })
    await symlink(join(root, 'node_modules/@deepseek-ai/schemastery'), join(home, 'node_modules/@deepseek-ai/schemastery'), process.platform === 'win32' ? 'junction' : 'dir')
    await writeFile(join(home, 'settings.mjs'), adapted['settings.js'])
    await writeFile(join(home, 'restart.js'), 'export const restartAllowed = () => false')
    const result = spawnSync(node, ['--input-type=module', '-e', `
      const mod = await import(${JSON.stringify(pathToFileURL(join(home, 'settings.mjs')).href)});
      const effects = []; let active = 0; const owner = {};
      const ctx = {fiber:owner, effect(fn){ effects.push(fn()); }, inject(deps, fn){fn(this);}, settings:{configure(p, fiber){if(p.auto !== false || fiber !== owner) throw Error('wrong policy owner');active++;return()=>active--;}}};
      mod.installDesktopMarketSettings(ctx);
      if(active !== 1 || mod.settingsNamespaceState() !== 'registered') throw Error('modern registration missing');
      effects.pop()();
      if(active !== 0) throw Error('presentation leaked');
      let calls = 0;ctx.settings = {register(ns, schema, opts){if(ns !== 'dsh-market' || Object.keys(schema.dict).length || Object.keys(opts.base).length) throw Error('wrong legacy namespace'); calls++;}};
      mod.installDesktopMarketSettings(ctx);
      if(calls !== 1) throw Error('legacy registration missing');
      console.log('settings lifecycle passed');
    `], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('settings lifecycle passed')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it.each(['directory', 'junction'])('derives the Desktop card in a real Harness child from a Profile %s', async (kind) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-market-settings-runtime-'))
  const profile = join(home, 'profiles', SAFE_MODE_PROFILE)
  const physical = join(home, 'market-source')
  const market = kind === 'junction' ? physical : join(profile, 'node_modules', 'dshmarket')
  const patch = join(home, 'market.patch.yml')
  const probe = join(home, 'probe.mjs')
  await ensureHostBundle()
  let host
  let endpoint
  const runtime = {
    async start() {
      host = new DesktopHostProcess({ node: createRequire(import.meta.url)('electron'), entry: hostBundle,
        runtimeDir: root, projectDir: profile, dshHome: home, profile: SAFE_MODE_PROFILE,
        environment: { DSH_DESKTOP_PATCH_FILE: patch }, primaryRuntime: join(home, 'unused-runtime') })
      endpoint = (await host.start()).url
    },
    snapshot() { return { phase: 'ready', url: new URL(endpoint).origin, authToken: new URL(endpoint).searchParams.get('token'), logs: [] } },
    async stop() { await host?.stop() }
  }
  try {
    await ensureSafeModeProfile(home)
    await mkdir(join(market, 'lib'), { recursive: true })
    await mkdir(join(market, 'node_modules/@deepseek-ai'), { recursive: true })
    await symlink(join(root, 'node_modules/@deepseek-ai/schemastery'), join(market, 'node_modules/@deepseek-ai/schemastery'), process.platform === 'win32' ? 'junction' : 'dir')
    await writeFile(join(market, 'package.json'), JSON.stringify({ name: 'dshmarket', version: '1.69.0', type: 'module', exports: './lib/index.js' }))
    for (const [file, source] of Object.entries(await sources())) await writeFile(join(market, 'lib', file), source)
    const stubs = {
      'dsh-cli.js': 'export const createDesktopPluginRuntime=()=>({dispose:async()=>{}});export const setHostPackageManager=()=>{};',
      'official-desktop.js': 'export const createOfficialDesktopRuntime=()=>({dispose:async()=>{}});',
      'profile.js': 'export const isDshProfileName=()=>true;',
      'http.js': 'export const setRequestGateSource=()=>undefined;export const setTrustedHostsSource=()=>undefined;',
      'restart.js': 'export const restartAllowed=()=>false;',
      'routes.js': `export function mountMarketRoutes(ctx, resolved){globalThis.__marketResolved=resolved;return()=>{delete globalThis.__marketResolved;};}`
    }
    for (const [file, source] of Object.entries(stubs)) await writeFile(join(market, 'lib', file), source)
    if (kind === 'junction') {
      await mkdir(join(profile, 'node_modules'), { recursive: true })
      await symlink(physical, join(profile, 'node_modules', 'dshmarket'), process.platform === 'win32' ? 'junction' : 'dir')
    }
    await writeFile(probe, `
      export const inject=[];
      export function apply(ctx){
        ctx.provide('desktopProfiles',{current:{name:'fixture-profile',dir:${JSON.stringify(profile)}}});
        ctx.provide('desktopPnpm',{});
        ctx.inject(['connection','settings'],scoped=>scoped.connection.fetch.register({path:'/api/fixture/market',methods:['GET'],requestBody:'buffered',fetch:async()=>{
          const descriptor=scoped.settings.describe().find(row=>row.ns==='dsh-market');
          let refused=false;
          try{await scoped.settings.update('dsh-market',{allowRestart:true},descriptor.revision);}catch{refused=true;}
          return Response.json({descriptor,refused,resolved:globalThis.__marketResolved});
        }}));
      }
    `)
    await writeFile(patch, `- insert:
    - id: market-probe
      name: ${pathToFileURL(probe).href}
    - id: dsh-market
      name: ${pathToFileURL(join(profile, 'node_modules/dshmarket/lib/index.js')).href}
      inject: [desktopProfiles]
      config:
        profile: fixture-profile
        allowRestart: true
        maxSnapshots: 17
        buildEnv:
          FIXTURE_BUILD: retained
`)
    // A restart must derive the same card without writing a schema, permission
    // exemption or a second copy of the third-party module into the Profile.
    for (let boot = 0; boot < 2; boot++) {
      await runtime.start(home, SAFE_MODE_PROFILE)
      const snapshot = runtime.snapshot()
      expect(snapshot.phase, snapshot.logs.join('\n')).toBe('ready')
      const login = await fetch(`${snapshot.url}/?token=${encodeURIComponent(snapshot.authToken)}`, { redirect: 'manual' })
      const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
      const response = await fetch(new URL('/api/fixture/market', snapshot.url), { headers: { Cookie: cookie } })
      expect(response.status, await response.clone().text() + '\n' + runtime.snapshot().logs.filter(line => !line.includes('token=')).join('\n')).toBe(200)
      const value = await response.json()
      expect(value).toMatchObject({ descriptor: { ns: 'dsh-market', autoGenerate: false, value: { desktopSettings: {} } }, refused: true, resolved: { profile: 'fixture-profile', desktopHost: true, allowRestart: false, maxSnapshots: 17, buildEnv: { FIXTURE_BUILD: 'retained' } } })
      await runtime.stop()
    }
    for (const [file, source] of Object.entries(await sources())) expect(await readFile(join(market, 'lib', file), 'utf8')).toBe(source)
  } finally {
    await runtime.stop()
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}, 90_000)
