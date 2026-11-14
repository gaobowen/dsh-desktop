import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { HarnessRuntime } from '../src/main/runtime/harness-runtime'
import { projectRoot } from './patch-path'

it('cancels a pending start instead of launching Harness after stop()', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-cancelled-start-'))
  const launch = vi.fn(() => { throw new Error('A cancelled launch must not spawn') })
  const runtime = new HarnessRuntime({
    dshEntryPath: join(projectRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
    nodeExecutablePath: process.execPath,
    nodeEntryPath: join(projectRoot, 'build/harness-node-entry.mjs'),
    dshPatchPath: join(projectRoot, 'build/dsh-desktop.patch.yml'),
    dshSafePatchPath: join(projectRoot, 'build/dsh-desktop-safe.patch.yml'),
    dshHome: home,
    logPath: join(home, 'harness.log'),
    launchProcess: launch,
    onChanged() {}
  })
  try {
    const starting = runtime.start(home)
    await runtime.stop()
    await starting
    expect(launch).not.toHaveBeenCalled()
    expect(runtime.launchAttemptId).toBe(0)
    expect(runtime.snapshot().phase).toBe('idle')
  } finally {
    await runtime.stop()
    await rm(home, { recursive: true, force: true })
  }
})
