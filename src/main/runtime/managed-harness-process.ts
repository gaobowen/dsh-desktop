import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process'
import type { HarnessChildProcess } from './harness-runtime'

/** Keep the detached Harness tied to this Desktop, including forced dev reloads. */
export function launchManagedHarnessProcess(
  executablePath: string,
  args: string[],
  options: SpawnOptionsWithoutStdio
): HarnessChildProcess {
  const child = spawn(executablePath, args, {
    ...options,
    env: { ...(options.env ?? process.env), DSH_DESKTOP_PARENT_LIFELINE: 'ipc' },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  })
  if (!child.stdout || !child.stderr) {
    child.kill()
    throw new Error('The managed Harness did not expose piped output.')
  }
  // spawn's general stdio overload cannot express a fourth IPC descriptor
  // together with non-null stdout/stderr. Narrow only the checked streams.
  return Object.assign(child, {
    stdout: child.stdout,
    stderr: child.stderr,
    requestShutdown: (): boolean => {
      if (!child.connected) return false
      child.disconnect()
      return true
    }
  })
}
