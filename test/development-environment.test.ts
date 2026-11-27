import { describe, expect, it } from 'vitest'
import { desktopHostStartupOptions, skipBlockingWindowsDevHmr } from '../src/main/development-environment'

describe('development HMR workaround', () => {
  it('skips the blocking HMR service only for unpackaged Windows development', () => {
    expect(skipBlockingWindowsDevHmr(true, 'win32')).toBe(false)
    expect(skipBlockingWindowsDevHmr(false, 'darwin')).toBe(false)
    expect(skipBlockingWindowsDevHmr(false, 'linux')).toBe(false)
    expect(skipBlockingWindowsDevHmr(false, 'win32')).toBe(true)
  })

  it('gives unpackaged Windows a longer loader budget while respecting an explicit override', () => {
    expect(desktopHostStartupOptions(false, 'win32', {})).toEqual({
      environment: { DSH_LOADER_TIMEOUT_MS: '300000' }, startupTimeoutMs: 360_000
    })
    for (const [packaged, platform] of [[true, 'win32'], [false, 'darwin']] as const) {
      expect(desktopHostStartupOptions(packaged, platform, {})).toEqual({ environment: {}, startupTimeoutMs: 160_000 })
    }
    const explicit = { DSH_LOADER_TIMEOUT_MS: '18000' }
    expect(desktopHostStartupOptions(false, 'win32', explicit)).toEqual({ environment: explicit, startupTimeoutMs: 78_000 })
  })
})
