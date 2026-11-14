/** Opt-in only: standalone CLI processes and tool descendants have no lifeline. */
export function installParentLifeline() {
  const mode = process.env.DSH_DESKTOP_PARENT_LIFELINE
  // A tool launching another Node process must not inherit Desktop ownership.
  delete process.env.DSH_DESKTOP_PARENT_LIFELINE
  if (mode !== 'ipc') return
  if (typeof process.send !== 'function') {
    throw new Error('Desktop parent lifeline requires a Node IPC channel.')
  }

  const outputClosed = (error) => {
    // A killed Desktop also closes its stdout/stderr readers. Do not let an
    // EPIPE recursively re-enter the entry's uncaught-exception reporter on
    // that same broken stderr pipe and starve asynchronous session disposal.
    if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') throw error
  }
  process.stdout.on('error', outputClosed)
  process.stderr.on('error', outputClosed)

  let stopping = false
  const parentGone = () => {
    if (stopping) return
    stopping = true
    process.stderr.write('[harness-node] Desktop control channel closed; shutting down Harness\n')
    // Harness 0.2.1 installs a SIGTERM listener that disposes the application
    // tree and drains session writers. Emitting it also works on Windows,
    // where an OS SIGTERM from child.kill() would force termination instead.
    // No listener means the owner disappeared before application boot.
    if (process.listenerCount('SIGTERM') === 0) process.exit(0)
    setTimeout(() => process.exit(0), 6_000).unref()
    process.emit('SIGTERM')
  }
  process.once('disconnect', parentGone)
  // Monitoring must not keep a completed/failed CLI alive on its own.
  process.channel?.unref()
  // Cover a parent that died before this entry installed the listener.
  if (!process.connected) parentGone()
}
