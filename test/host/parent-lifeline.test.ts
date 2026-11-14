import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

it.each([[false, false], [true, false], [false, true]])('releases a disconnected Host, stuck disposal=%s, closed pipes=%s', async (stuck, closedPipes) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-host-lifeline-'))
  let child: ChildProcess | undefined
  try {
    const entry = join(home, 'lifeline.mjs')
    const marker = join(home, 'drained')
    await build({ entryPoints: [resolve('src/host/parent-lifeline.ts')], outfile: entry, bundle: true, platform: 'node', format: 'esm' })
    const fixture = join(home, 'child.mjs')
    await writeFile(fixture, `
      import { installHostParentLifeline } from './lifeline.mjs';
      import { writeFile } from 'node:fs/promises';
      setInterval(()=>{},1000);
      installHostParentLifeline(async()=>{
        ${closedPipes ? "process.stdout.write('draining\\n');process.stderr.write('draining\\n');" : ''}
        ${stuck ? 'await new Promise(()=>{});' : `await new Promise(r=>setTimeout(r,30));await writeFile(${JSON.stringify(marker)},'drained');`}
      }, 250);
      process.send({ready:true});
    `)
    child = spawn(process.execPath, [fixture], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    const exited = new Promise<number | null>(resolveExit => child?.once('exit', resolveExit))
    await new Promise<void>((resolveReady, reject) => {
      child?.once('message', () => resolveReady())
      child?.once('error', reject)
    })
    // Closing this kernel IPC channel is also what an abruptly killed parent
    // does. Only this test-owned process is terminated; no executable scan.
    if (closedPipes) {
      child.stdout?.destroy()
      child.stderr?.destroy()
    }
    child.disconnect()
    expect(await exited).toBe(stuck ? 1 : 0)
    if (!stuck) expect(await readFile(marker, 'utf8')).toBe('drained')
  } finally {
    if (child !== undefined && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await rm(home, { recursive: true, force: true })
  }
})
