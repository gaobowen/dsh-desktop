/**
 * Unpackaged Windows development deadlocks in `@deepseek-ai/dsh-hmr`:
 * the watcher never becomes ready, so profile boot never finishes.
 * Packaged launches keep the upstream service.
 */
export function skipBlockingWindowsDevHmr(packaged: boolean, platform: NodeJS.Platform): boolean {
  return !packaged && platform === 'win32'
}

/** Leave time for cold Windows plugin imports and keep the loader's own diagnosis first. */
export function desktopHostStartupOptions(packaged: boolean, platform: NodeJS.Platform, environment: NodeJS.ProcessEnv): {
  environment: NodeJS.ProcessEnv
  startupTimeoutMs: number
} {
  const configured = Number(environment.DSH_LOADER_TIMEOUT_MS)
  const explicit = Number.isFinite(configured) && configured > 0
  const windowsDev = !packaged && platform === 'win32'
  const loaderTimeoutMs = explicit ? configured : windowsDev ? 300_000 : 100_000
  return {
    environment: windowsDev && !explicit ? { ...environment, DSH_LOADER_TIMEOUT_MS: String(loaderTimeoutMs) } : environment,
    startupTimeoutMs: Math.min(2_147_483_647, loaderTimeoutMs + 60_000)
  }
}
