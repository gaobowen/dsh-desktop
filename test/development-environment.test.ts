import { describe, expect, it } from 'vitest'
import { desktopHostStartupOptions, developmentEnvironment, skipBlockingWindowsDevHmr } from '../src/main/development-environment'

describe('development worktree isolation', () => {
  it('keeps defaults and ignores development overrides in production', () => {
    expect(developmentEnvironment(false, 43129, { DSH_DEV_PROFILE: '../unsafe', DSH_DEV_HARNESS_PORT: 'invalid' }))
      .toEqual({ profile: 'dsh-desktop', harnessPort: 43129, mobilePort: 43127 })
    expect(developmentEnvironment(true, 43129, {}))
      .toEqual({ profile: 'dsh-desktop-dev', harnessPort: 43130, mobilePort: 43128 })
  })

  it('uses distinct profile and loopback ports for a second worktree', () => {
    expect(developmentEnvironment(true, 43129, {
      DSH_DEV_PROFILE: 'dsh-desktop-dev-workbench', DSH_DEV_HARNESS_PORT: '43132', DSH_DEV_MOBILE_PORT: '43133'
    })).toEqual({ profile: 'dsh-desktop-dev-workbench', harnessPort: 43132, mobilePort: 43133 })
  })

  it.each(['../profile', '/tmp/profile', 'a/b', 'a\\b', 'dsh-desktop', '..'])('rejects unsafe profile %s', profile => {
    expect(() => developmentEnvironment(true, 43129, { DSH_DEV_PROFILE: profile })).toThrow('DSH_DEV_PROFILE')
  })

  it.each(['0', '1023', '65536', '-1', '12.5', 'invalid', ' 43132 '])('rejects invalid port %s', value => {
    expect(() => developmentEnvironment(true, 43129, { DSH_DEV_HARNESS_PORT: value })).toThrow('DSH_DEV_HARNESS_PORT')
    expect(() => developmentEnvironment(true, 43129, { DSH_DEV_MOBILE_PORT: value })).toThrow('DSH_DEV_MOBILE_PORT')
  })

  it('skips the blocking HMR service only for unpackaged Windows development', () => {
    expect(skipBlockingWindowsDevHmr(true, 'win32')).toBe(false)
    expect(skipBlockingWindowsDevHmr(false, 'darwin')).toBe(false)
    expect(skipBlockingWindowsDevHmr(false, 'linux')).toBe(false)
    expect(skipBlockingWindowsDevHmr(false, 'win32')).toBe(true)
  })

  it('rejects colliding service ports', () => {
    expect(() => developmentEnvironment(true, 43129, { DSH_DEV_MOBILE_PORT: '43130' })).toThrow('must differ')
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
