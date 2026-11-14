import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { projectRoot } from './patch-path'
import { launchManagedHarnessProcess } from '../src/main/runtime/managed-harness-process'
import type { HarnessChildProcess } from '../src/main/runtime/harness-runtime'
import { stopHarnessChild } from '../src/main/runtime/stop-harness-child'
import { ensureSafeModeProfile, SAFE_MODE_PROFILE } from '../src/main/state/safe-mode-profile'

const require = createRequire(import.meta.url)
const electron: string = require('electron')
const nodeEntry = join(projectRoot, 'build/harness-node-entry.mjs')

async function until(check: () => boolean | Promise<boolean>, timeout = 15_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error('Lifecycle fixture timed out')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

async function stopFixture(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  child.kill('SIGKILL')
  await exited
}

describe('Desktop parent lifeline', () => {
  it.each(['quit', 'forced-reload', 'forced-real-harness'] as const)(
    'disposes an Electron Node Harness when its real Electron main ends: %s', async (mode) => {
      const home = await mkdtemp(join(tmpdir(), 'dsh-lifeline-'))
      let owner: ChildProcessWithoutNullStreams | undefined
      let harnessPid: number | undefined
      try {
        const entry = join(home, 'fixture.mjs')
        const marker = join(home, 'disposed.txt')
        const quitRequest = join(home, 'quit-request')
        const savedSession = join(home, 'session-sentinel.json')
        let childArguments = [nodeEntry, entry]
        await writeFile(savedSession, '{"fixture":"preserve existing session data"}\n')
        await writeFile(entry, `
import { writeFile } from 'node:fs/promises'
export async function runCli() {
  if (process.env.DSH_DESKTOP_PARENT_LIFELINE !== undefined) throw new Error('Ownership leaked to descendants')
  process.on('SIGTERM', async () => {
    await writeFile(${JSON.stringify(marker)}, 'disposed')
    process.exit(0)
  })
  setInterval(() => {}, 1000)
  process.stdout.write('fixture-ready:' + process.pid + '\\n')
}
`)
        if (mode === 'forced-real-harness') {
          await ensureSafeModeProfile(home)
          const plugin = join(home, 'dispose-probe.mjs')
          const patch = join(home, 'dispose-probe.patch.yml')
          await writeFile(plugin, `
import { writeFile } from 'node:fs/promises'
export function apply(ctx) {
  ctx.effect(() => async () => { await writeFile(${JSON.stringify(marker)}, 'disposed') })
}
`)
          await writeFile(patch, `- insert:\n    - id: lifecycle-dispose-probe\n      name: ${JSON.stringify(pathToFileURL(plugin).href)}\n`)
          childArguments = [
            '--expose-internals', nodeEntry,
            join(projectRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
            '--profile', SAFE_MODE_PROFILE,
            '--patch', join(projectRoot, 'build/dsh-desktop-safe.patch.yml'),
            '--patch', patch, '--no-open', '--host', '127.0.0.1', '--port', '0'
          ]
        }
        // Bundle the actual host launcher/stop implementation into an isolated
        // Electron main. No real Desktop Profile or session is opened.
        const bundled = await build({
          stdin: { contents: `
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { launchManagedHarnessProcess } from ${JSON.stringify(join(projectRoot, 'src/main/runtime/managed-harness-process.ts'))}
import { stopHarnessChild } from ${JSON.stringify(join(projectRoot, 'src/main/runtime/stop-harness-child.ts'))}
app.setPath('userData', ${JSON.stringify(join(home, 'desktop-user-data'))})
let child
let quitting = false
app.on('before-quit', event => {
  if (quitting || !child) return
  event.preventDefault()
  quitting = true
  stopHarnessChild(child, () => {}).finally(() => app.quit())
})
app.whenReady().then(() => {
  child = launchManagedHarnessProcess(process.execPath,
    ${JSON.stringify(childArguments)},
    {cwd:${JSON.stringify(home)}, env:{...process.env, ELECTRON_RUN_AS_NODE:'1', DSH_HOME:${JSON.stringify(home)}, DSH_DESKTOP_HOST_RESOLVED:'1'}, detached:process.platform === 'win32', windowsHide:true})
  child.once('spawn', () => console.log('managed-child:' + child.pid))
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
  const quitPoll = setInterval(() => {
    if (!existsSync(${JSON.stringify(quitRequest)})) return
    clearInterval(quitPoll)
    app.quit()
  }, 50)
})
`, resolveDir: projectRoot },
          bundle: true, write: false, platform: 'node', format: 'cjs', external: ['electron']
        })
        const script = join(home, 'owner.cjs')
        const output = bundled.outputFiles[0]
        if (!output) throw new Error('Missing owner fixture bundle')
        await writeFile(script, output.contents)
        const env = { ...process.env }
        delete env.ELECTRON_RUN_AS_NODE
        delete env.DSH_DESKTOP_PARENT_LIFELINE
        owner = spawn(electron, [script], { cwd: home, env, windowsHide: true, stdio: 'pipe' })
        let logs = ''
        owner.stdout.on('data', chunk => { logs += chunk.toString() })
        owner.stderr.on('data', chunk => { logs += chunk.toString() })
        await until(() => {
          const match = /managed-child:(\d+)/u.exec(logs)
          if (match?.[1]) harnessPid = Number(match[1])
          if (owner?.exitCode !== null && owner?.exitCode !== undefined) throw new Error(logs)
          const ready = mode === 'forced-real-harness' ? logs.includes('dsh web:') : logs.includes('fixture-ready:')
          return harnessPid !== undefined && ready
        }, 25_000)
        const runningPid = harnessPid
        if (runningPid === undefined) throw new Error('Missing Harness PID')
        expect(alive(runningPid)).toBe(true)
        if (mode === 'quit') await writeFile(quitRequest, 'quit')
        else owner.kill('SIGKILL')
        await until(() => !alive(runningPid))
        await until(() => owner?.exitCode !== null || owner?.signalCode !== null)
        expect(await readFile(marker, 'utf8')).toBe('disposed')
        expect(await readFile(savedSession, 'utf8')).toBe('{"fixture":"preserve existing session data"}\n')
      } finally {
        if (owner) await stopFixture(owner)
        if (harnessPid !== undefined && alive(harnessPid)) {
          const leftoverPid = harnessPid
          process.kill(leftoverPid, 'SIGKILL')
          await until(() => !alive(leftoverPid))
        }
        await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      }
    }, 45_000)

  it('does not keep a completed CLI alive or leak ownership to tool processes', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-lifeline-finite-'))
    let child: HarnessChildProcess | undefined
    try {
      const entry = join(home, 'finite.mjs')
      await writeFile(entry, `export function runCli() { console.log('ownership:' + process.env.DSH_DESKTOP_PARENT_LIFELINE) }`)
      child = launchManagedHarnessProcess(electron, [nodeEntry, entry], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true
      })
      let output = ''
      child.stdout.on('data', chunk => { output += chunk.toString() })
      child.stderr.on('data', chunk => { output += chunk.toString() })
      await until(() => child?.exitCode !== null, 10_000)
      expect(child.exitCode, output).toBe(0)
      expect(output).toContain('ownership:undefined')
    } finally {
      if (child) await stopHarnessChild(child, () => {})
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
})
