/**
 * A killed Desktop cannot escalate a stuck Host shutdown. Bound disposal inside
 * the child too, and tolerate its now-broken diagnostic pipe without recursively
 * logging EPIPE. This never scans processes or removes Session ownership locks.
 */
export function installHostParentLifeline(stop: () => Promise<void>, deadlineMs = 6_000): void {
  const pipeError = (error: NodeJS.ErrnoException): void => {
    if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') process.exit(1)
  }
  process.stdout.on('error', pipeError)
  process.stderr.on('error', pipeError)
  let disconnected = false
  const onDisconnect = (): void => {
    if (disconnected) return
    disconnected = true
    const deadline = setTimeout(() => { process.exit(1) }, deadlineMs)
    deadline.unref()
    void stop().then(() => {
      clearTimeout(deadline)
      process.exit(process.exitCode ?? 0)
    }, (error: unknown) => {
      console.error('desktop Host parent-disconnect shutdown failed', error)
      process.exit(1)
    })
  }
  process.once('disconnect', onDisconnect)
  // IPC may have closed while the static imports were loading.
  if (process.send !== undefined && !process.connected) onDisconnect()
}
