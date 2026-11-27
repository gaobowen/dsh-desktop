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
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as Record<string, unknown>
    await writeFile(join(application, 'package.json'), JSON.stringify({
      name: manifest.name, version: manifest.version, main: 'fixture.cjs', type: 'module',
      dependencies: manifest.dependencies,
      dshDesktopIdentity: manifest.dshDesktopIdentity,
      dshDesktopHostPlugins: manifest.dshDesktopHostPlugins
    }))
    const fixture = await readFile(join(root, 'test/shell/fork-ui-electron-fixture.cjs'), 'utf8')
    await writeFile(join(application, 'fixture.cjs'), fixture)
    const relay = join(temporary, 'relay.mjs')
    await writeFile(relay, `
      import { writeFileSync } from 'node:fs';
      writeFileSync(new URL('./relay-active', import.meta.url), 'ready');
      let original = globalThis.fetch; let tokenName;
      const relayFetch = async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.url);
        if(url.origin !== 'https://router.vinabot.ai') return original(input, init);
        const json = data => Response.json({success:true,data});
        if(url.pathname === '/api/status') return json({turnstile_check:false});
        if(url.pathname === '/api/user/login') return json({access_token:'fixture-panel',user:{display_name:'Fixture'}});
        if(url.pathname === '/api/token/search') return json({items:tokenName?[{id:41,status:1,name:tokenName}]:[]});
        if(url.pathname === '/api/token/') {tokenName=JSON.parse(init.body).name;return json({});}
        if(url.pathname === '/api/token/41/key') return json({key:'fixture-key'});
        if(url.pathname === '/v1/models') return json([{id:'gpt-6.1-sol',supported_endpoint_types:['openai-response']}]);
        if(url.pathname === '/v1/responses') {
          const item = {id:'msg_fixture',type:'message',role:'assistant',status:'completed',
            content:[{type:'output_text',text:'Fixture reply',annotations:[]}]};
          const events = [
            {type:'response.output_item.done',output_index:0,item},
            {type:'response.completed',response:{id:'resp_fixture',status:'completed',output:[item]}}
          ];
          return new Response(events.map(event => 'data: '+JSON.stringify(event)+'\\n\\n').join(''),
            {headers:{'content-type':'text/event-stream'}});
        }
        if(url.pathname === '/api/user/auth/logout') return json({});
        throw Error('Unexpected relay fixture path: '+url.pathname);
      };
      // rc.5 installs Undici globals during profile boot. Keep the relay mock
      // active and delegate unrelated requests to the current transport.
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true, get: () => relayFetch,
        set: fetch => { if (fetch !== relayFetch) original = fetch; }
      });
    `)
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DSH_FORK_UI_ROOT: temporary,
      DSH_FORK_UI_ENTRY: pathToFileURL(join(root, 'out/main/index.js')).href,
      DSH_FORK_UI_RELAY: pathToFileURL(relay).href,
      DSH_DESKTOP_PRIMARY_RUNTIME_DIR: join(root, '.build/office-runtime/primary-runtime'),
      DSH_DEV_PROFILE: 'fork-acceptance',
      DSH_DEV_MOBILE_PORT: '44311'
    }
    delete env.ELECTRON_RUN_AS_NODE
    const result = await new Promise<{ code: number | null; output: string }>((resolveRun, reject) => {
      const child = spawn(createRequire(import.meta.url)('electron') as string, [application], { cwd: application, env, windowsHide: true })
      let output = ''
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
      const deadline = setTimeout(() => { child.kill(); reject(new Error(`Fork UI timed out; evidence: ${temporary}`)) }, 240_000)
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
      officeModes: ['word', 'excel', 'ppt'], sessionExportMenu: true })
    expect(await readdir(join(home, 'DSH Desktop', 'Temporary Chats'))).toHaveLength(1)
  } finally {
    if (cleanExit) await rm(temporary, { recursive: true, force: true })
    else console.error('Fork UI evidence retained at', temporary)
  }
}, 260_000)
