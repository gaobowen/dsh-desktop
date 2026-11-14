import type { HarnessChildProcess } from './harness-runtime'

/** Wait for actual termination, including after force-kill, before reporting stopped. */
export async function stopHarnessChild(
  child: HarnessChildProcess,
  log: (line: string) => void
): Promise<void> {
  if (child.exitCode !== null) return
  let exited = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let signalExit: (() => void) | undefined
  let killFailure: unknown
  const onExit = (): void => {
    exited = true
    signalExit?.()
  }
  child.once('exit', onExit)
  const waitForExit = async (timeoutMs: number): Promise<boolean> => {
    if (exited) return true
    return new Promise<boolean>((resolve) => {
      signalExit = () => { clearTimeout(timer); resolve(true) }
      timer = setTimeout(() => { signalExit = undefined; resolve(false) }, timeoutMs)
    })
  }
  const kill = (signal: NodeJS.Signals): void => {
    try {
      if (!child.kill(signal)) log(`[desktop] Harness ${signal} was not accepted; waiting for exit`)
    } catch (error) {
      killFailure = error
      log(`[desktop] Harness ${signal} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  try {
    let requested = false
    try {
      requested = child.requestShutdown?.() ?? false
    } catch (error) {
      log(`[desktop] Harness shutdown request failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!requested) kill('SIGTERM')
    // Harness 0.2.1 allows its disposer five seconds. Give it that entire
    // window before escalating, including on Windows via the IPC lifeline.
    if (await waitForExit(6_000)) return
    log('[desktop] Harness did not exit after shutdown request; sending SIGKILL')
    kill('SIGKILL')
    if (!await waitForExit(4_000)) {
      throw new Error('Harness did not exit after SIGKILL.', { cause: killFailure })
    }
  } finally {
    clearTimeout(timer)
    child.removeListener('exit', onExit)
  }
}
