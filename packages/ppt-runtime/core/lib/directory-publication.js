import { lstat, rename } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const RETRY_DELAYS = [50, 100, 200, 400, 800, 1600, 3200]

/** Windows scanners can briefly retain freshly written large assets. Retry only
 * transient errors and never retry over an existing destination. The caller
 * keeps ownership of the staging directory and handles a final failure.
 * @param {string} source - Caller-owned staging directory.
 * @param {string} target - Validated publication destination.
 * @param {{platform?: string, rename?: typeof rename, delay?: (ms: number) => Promise<unknown>}} options - Internal platform/test adapters.
 */
export async function publishDirectory(source, target, options = {}) {
  const move = options.rename ?? rename
  const wait = options.delay ?? delay
  const platform = options.platform ?? process.platform
  for (let attempt = 0; ; attempt += 1) {
    try {
      await move(source, target)
      return
    } catch (error) {
      if (platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === RETRY_DELAYS.length) throw error
      try {
        await lstat(target)
      } catch (inspectionError) {
        if (inspectionError.code !== 'ENOENT') throw error
        await wait(RETRY_DELAYS[attempt])
        continue
      }
      throw error
    }
  }
}
