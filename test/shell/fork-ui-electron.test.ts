import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

it('mounts the fork UI in the real shell and opens an editable temporary Session', async () => {
  const root = resolve(import.meta.dirname, '../..')
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-fork-ui-'))
  const application = join(temporary, 'application')
  const appData = join(temporary, 'app-data')
  const home = join(temporary, 'home')
  let cleanExit = false
  try {
    for (const directory of [application, appData, home]) await mkdir(directory)
    for (const directory of ['node_modules', 'build']) {
      await symlink(join(root, directory), join(application, directory), process.platform === 'win32' ? 'junction' : 'dir')
    }
    await writeFile(join(application, 'package.json'), JSON.stringify({
      name: 'dsh-desktop', version: '0.14.0', main: 'fixture.cjs', type: 'module'
    }))
    const fixture = await readFile(join(root, 'test/shell/fork-ui-electron-fixture.cjs'), 'utf8')
    await writeFile(join(application, 'fixture.cjs'), fixture)
    const relay = join(temporary, 'relay.mjs')
    await writeFile(relay, `
      const original = globalThis.fetch; let tokenName;
      globalThis.fetch = async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.url);
        if(url.origin !== 'https://router.vinabot.ai') return original(input, init);
        const json = data => Response.json({success:true,data});
        if(url.pathname === '/api/status') return json({turnstile_check:false});
        if(url.pathname === '/api/user/login') return json({access_token:'fixture-panel',user:{display_name:'Fixture'}});
        if(url.pathname === '/api/token/search') return json({items:tokenName?[{id:41,status:1,name:tokenName}]:[]});
        if(url.pathname === '/api/token/') {tokenName=JSON.parse(init.body).name;return json({});}
        if(url.pathname === '/api/token/41/key') return json({key:'fixture-key'});
        if(url.pathname === '/v1/models') return json([{id:'gpt-6.1-sol',supported_endpoint_types:['openai-response']}]);
        if(url.pathname === '/api/user/auth/logout') return json({});
        throw Error('Unexpected relay fixture path: '+url.pathname);
      };
    `)
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DSH_FORK_UI_ROOT: temporary,
      DSH_FORK_UI_ENTRY: pathToFileURL(join(root, 'out/main/index.js')).href,
      DSH_FORK_UI_RELAY: pathToFileURL(relay).href,
      DSH_DESKTOP_PRIMARY_RUNTIME_DIR: join(root, '.build/office-runtime/primary-runtime'),
      DSH_DEV_PROFILE: 'fork-acceptance',
      DSH_DEV_HARNESS_PORT: '44310',
      DSH_DEV_MOBILE_PORT: '44311'
    }
    delete env.ELECTRON_RUN_AS_NODE
    const result = await new Promise<{ code: number | null; output: string }>((resolveRun, reject) => {
      const child = spawn(createRequire(import.meta.url)('electron') as string, [application], { cwd: application, env, windowsHide: true })
      let output = ''
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
      const deadline = setTimeout(() => { child.kill(); reject(new Error(`Fork UI timed out; evidence: ${temporary}`)) }, 110_000)
      child.once('error', error => { clearTimeout(deadline); reject(error) })
      child.once('close', code => { clearTimeout(deadline); resolveRun({ code, output }) })
    })
    cleanExit = result.code === 0 && result.output.includes('FORK-UI-ACCEPTANCE-COMPLETE')
    expect(result.code, result.output.replace(/token=[^\s]+/gu, 'token=[redacted]')).toBe(0)
    expect(result.output).toContain('[desktop] Harness is ready')
    expect(result.output).not.toContain("Error occurred in handler for 'desktop-titlebar:set-theme'")
    expect(result.output).toContain('FORK-UI-ACCEPTANCE-COMPLETE')
    const evidence = JSON.parse(await readFile(join(temporary, 'evidence.json'), 'utf8')) as unknown
    expect(evidence).toMatchObject({ configured: true, standardComposer: true, draft: true, high: true, temporaryGroup: true,
      officeModes: ['word', 'excel', 'ppt'] })
    expect(await readdir(join(home, 'DSH Desktop', 'Temporary Chats'))).toHaveLength(1)
  } finally {
    if (cleanExit) await rm(temporary, { recursive: true, force: true })
    else console.error('Fork UI evidence retained at', temporary)
  }
}, 120_000)
