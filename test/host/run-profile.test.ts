import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import PptxGenJS from 'pptxgenjs'
import { afterEach, expect, it } from 'vitest'
import { ensureSafeModeProfile, SAFE_MODE_PROFILE } from '../../src/main/recovery/safe-mode-profile'
import { DesktopHostProcess } from '../../src/main/shell/backend/host-process'
import { writeDesktopProductPatch } from '../../src/main/shell/product-patch'
import { ensureHostBundle, hostBundle } from './host-bundle-helper'

const require = createRequire(import.meta.url)
const electron = require('electron') as string
const root = resolve(import.meta.dirname, '../..')
const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

it('boots normal Office and loads the PPT renderer on the first actual template import', async () => {
  await ensureHostBundle()
  const home = await mkdtemp(join(tmpdir(), 'dsh-shell-profile-'))
  temporary.push(home)
  const profile = join(home, 'profiles', 'desktop')
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } }
  }))
  await writeFile(join(profile, 'cordis.yml'), '[]\n')
  await writeFile(join(profile, 'cordis.patch.yml'), '[]\n')
  const trace = join(home, 'ppt-modules.log')
  const hook = join(home, 'trace-ppt.mjs')
  await writeFile(hook, String.raw`
    import { appendFileSync } from 'node:fs'
    import { registerHooks } from 'node:module'
    appendFileSync(process.env.DSH_TEST_PPT_TRACE, 'trace-active\n')
    registerHooks({ load(url, context, nextLoad) {
      const file = url.split('/').at(-1)
      if (/^(office-modes|index|pptd(?:-[\w-]+)?|pptx-converter|office-template-preview)\.js$/.test(file)
        && /\/dsh-ppt\/lib\/[^/]+$/.test(url)) appendFileSync(process.env.DSH_TEST_PPT_TRACE, file + '\n')
      return nextLoad(url, context)
    } })
  `)
  const resources = join(root, '.build', 'office-runtime')
  const host = new DesktopHostProcess({
    node: electron,
    entry: hostBundle,
    runtimeDir: root,
    projectDir: profile,
    dshHome: home,
    profile: 'desktop',
    environment: {
      DSH_DESKTOP_PATCH_FILE: await writeDesktopProductPatch(home, 'desktop', { skipBlockingHmr: process.platform === 'win32' }),
      DSH_DESKTOP_OFFICE_RESOURCES: resources,
      DSH_DESKTOP_OFFICE_CLI: join(root, 'build', 'office-cli.mjs'),
      DSH_TEST_PPT_TRACE: trace,
      NODE_OPTIONS: '--import=' + pathToFileURL(hook).href
    },
    primaryRuntime: join(resources, 'primary-runtime')
  })
  try {
    const start = performance.now()
    const ready = await host.start()
    console.info('Office/PPT Host ready in %d ms', Math.round(performance.now() - start))
    const url = new URL(ready.url)
    expect(url.protocol).toBe('http:')
    expect(url.hostname).toBe('127.0.0.1')
    expect(url.port).not.toBe('')
    const response = await fetch(ready.url, { redirect: 'manual' })
    expect(response.status).toBe(303)
    const cookie = response.headers.getSetCookie().map(line => line.split(';')[0]).join('; ')
    expect(cookie).not.toBe('')
    const injections = JSON.stringify(ready.injections)
    expect(injections).toContain('dsh-desktop-office')
    expect(injections).toContain('dsh-ppt-composer')
    expect(injections).toContain('dsh-desktop-vinabot')

    const rpc = async (path: string, payload: object, method = 'office-templates'): Promise<unknown> => {
      const result = await fetch(new URL(path, url), {
        method: 'POST',
        headers: { cookie, origin: url.origin, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'office-smoke', method, payload }),
        signal: AbortSignal.timeout(120_000)
      })
      expect(result.status, path).toBe(200)
      const envelope = await result.json() as { result: unknown }
      return envelope.result
    }
    const sessionId = 'office-ppt-smoke'
    const office = (endpoint: string, extra: object = {}): Promise<unknown> =>
      rpc('/api/office-templates', { endpoint, sessionId, ...extra })
    const ppt = (endpoint: string, extra: object = {}): Promise<unknown> =>
      rpc('/dsh-ppt/' + endpoint, { sessionId, ...extra }, 'dsh-ppt')
    expect(await office('mode', { mode: 'word' })).toMatchObject({ ok: true, value: { mode: 'word' } })
    expect(await office('mode', { mode: 'excel' })).toMatchObject({ ok: true, value: { mode: 'excel' } })
    expect(await ppt('state')).toMatchObject({ value: { status: 'ok', data: { documentMode: 'excel' } } })
    expect(await ppt('template/catalog')).toMatchObject({
      value: { status: 'ok', data: { templates: expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]) } }
    })
    expect(await ppt('presentation/mode', { mode: 'ppt' })).toMatchObject({ value: { status: 'ok' } })
    expect(await office('state')).toMatchObject({ ok: true, value: { mode: null, presentationMode: 'ppt' } })
    expect(await office('mode', { mode: 'word' })).toMatchObject({ ok: true, value: { mode: 'word', presentationMode: null } })
    expect(await rpc('/kimi-ppt/state', { sessionId })).toMatchObject({ value: { status: 'ok', data: { documentMode: 'word' } } })
    const beforeRender = await readFile(trace, 'utf8')
    expect(beforeRender).toContain('office-modes.js')
    expect(beforeRender).toContain('index.js')
    expect(beforeRender).not.toMatch(/pptd|pptx-converter|office-template-preview/u)

    const source = new PptxGenJS()
    source.layout = 'LAYOUT_WIDE'
    source.addSlide().addText('Office render verification', { x: 1, y: 1, w: 9, h: 1, fontSize: 28 })
    const bytes = Buffer.from(await source.write({ outputType: 'nodebuffer' }) as Buffer)
    expect(await ppt('template/prepare', { input: { fileName: 'source.pptx', base64: bytes.toString('base64') } }))
      .toMatchObject({ value: { status: 'ok', data: { draftId: expect.any(String) } } })
    const afterRender = await readFile(trace, 'utf8')
    expect(afterRender).toContain('pptx-converter.js')
    expect(afterRender).toContain('office-template-preview.js')
  } finally {
    await host.stop()
  }
}, 240_000)

it('boots safe mode without creating the shared profile modules directory', async () => {
  await ensureHostBundle()
  const home = await mkdtemp(join(tmpdir(), 'dsh-shell-safe-'))
  temporary.push(home)
  const profile = await ensureSafeModeProfile(home, 'desktop')
  const host = new DesktopHostProcess({
    node: electron,
    entry: hostBundle,
    runtimeDir: root,
    projectDir: profile,
    dshHome: home,
    profile: SAFE_MODE_PROFILE,
    environment: { DSH_DESKTOP_PATCH_FILE: await writeDesktopProductPatch(home, 'safe') },
    primaryRuntime: join(home, 'unused-runtime')
  })
  try {
    const ready = await host.start()
    expect(new URL(ready.url).hostname).toBe('127.0.0.1')
    const manifest: unknown = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
    expect(manifest).toMatchObject({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } })
    await expect(lstat(join(home, 'profiles', 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' })
    const injections = JSON.stringify(ready.injections)
    expect(injections).not.toContain('dsh-desktop-office')
    expect(injections).not.toContain('dsh-ppt-composer')
    expect(injections).not.toContain('dsh-desktop-vinabot')
  } finally {
    await host.stop()
  }
}, 120_000)
