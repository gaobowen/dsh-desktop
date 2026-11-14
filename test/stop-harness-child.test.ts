import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HarnessChildProcess } from '../src/main/runtime/harness-runtime'
import { stopHarnessChild } from '../src/main/runtime/stop-harness-child'

class FakeChild extends EventEmitter implements HarnessChildProcess {
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode: number | null = null
  kill = vi.fn((_signal?: NodeJS.Signals) => true)
  requestShutdown = vi.fn(() => false)
}

afterEach(() => vi.useRealTimers())

describe('bounded Harness termination', () => {
  it('does not kill an already exited child', async () => {
    const child = new FakeChild()
    child.exitCode = 0
    await stopHarnessChild(child, vi.fn())
    expect(child.kill).not.toHaveBeenCalled()
    expect(child.listenerCount('exit')).toBe(0)
  })

  it('uses the lifeline for graceful shutdown and waits for actual exit', async () => {
    const child = new FakeChild()
    child.requestShutdown.mockReturnValue(true)
    let settled = false
    const stopping = stopHarnessChild(child, vi.fn()).then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(child.kill).not.toHaveBeenCalled()
    child.emit('exit', 0)
    await stopping
    expect(child.listenerCount('exit')).toBe(0)
  })

  it('waits for the SIGKILL exit instead of reporting success after sending it', async () => {
    vi.useFakeTimers()
    const child = new FakeChild()
    let settled = false
    const stopping = stopHarnessChild(child, vi.fn()).then(() => { settled = true })
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    await vi.advanceTimersByTimeAsync(6_000)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(settled).toBe(false)
    child.emit('exit', null, 'SIGKILL')
    await stopping
    expect(vi.getTimerCount()).toBe(0)
    expect(child.listenerCount('exit')).toBe(0)
  })

  it('reports unconfirmed termination and preserves the kill failure', async () => {
    vi.useFakeTimers()
    const child = new FakeChild()
    const denied = new Error('fixture kill denied')
    child.kill.mockImplementation(() => { throw denied })
    const log = vi.fn()
    const stopping = stopHarnessChild(child, log)
    const rejected = expect(stopping).rejects.toMatchObject({
      message: 'Harness did not exit after SIGKILL.', cause: denied
    })
    await vi.advanceTimersByTimeAsync(10_000)
    await rejected
    expect(log).toHaveBeenCalledWith(expect.stringContaining('fixture kill denied'))
    expect(child.listenerCount('exit')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('falls back to an OS signal when the control channel cannot close', async () => {
    const child = new FakeChild()
    child.requestShutdown.mockImplementation(() => { throw new Error('fixture closed channel') })
    child.kill.mockImplementation(() => { child.emit('exit', 0); return true })
    const log = vi.fn()
    await stopHarnessChild(child, log)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('fixture closed channel'))
  })
})
