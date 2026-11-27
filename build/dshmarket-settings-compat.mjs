import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// A load-time patch, not another market installation. Keep backend/client
// discovery and all ordinary dependencies anchored to the Profile package.
// Remove when upstream exports a Config and uses settings.configure on Desktop.
const MARKET_VERSION = '1.69.0'
const SOURCE_HASHES = {
  'index.js': '4016d488a61c200464fd8c953d2ff5db4c8f70128c8306f5805793fa45bfbc4b',
  'settings.js': '60929d9a45189dbd9d81c9c6668e07277f9a9c7662b11d9a514be54374e82ee4'
}

const CONFIG = `
import z from '@deepseek-ai/schemastery';
export const Config = z.object({
    profile: z.string().required(false),
    allowRestart: z.boolean().required(false),
    maxSnapshots: z.number().required(false),
    buildEnv: z.dict(z.string()).required(false),
    // An empty live section admits the custom card without making the
    // composed Profile, build environment or restart policy editable.
    desktopSettings: z.object({}).volatile(),
});
`

const DESKTOP_SETTINGS = `
        if (typeof scoped.settings.configure === 'function') {
            scoped.effect(() => scoped.settings.configure({ auto: false }, ctx.fiber));
            namespaceState = 'registered';
            return;
        }
`

function sha256(source) {
  return createHash('sha256').update(source).digest('hex')
}

/**
 * Apply only the two audited npm sources; a changed release stays unmodified.
 * @param {Record<string, string>} sources Original UTF-8 npm module sources.
 * @returns {Record<string, string>} Adapted modules, never written to disk.
 */
export function adaptMarketSettingsSources(sources) {
  for (const [name, hash] of Object.entries(SOURCE_HASHES)) {
    if (typeof sources[name] !== 'string' || sha256(sources[name]) !== hash) {
      throw new Error(`dshmarket ${MARKET_VERSION} settings adapter: unexpected ${name} source`)
    }
  }
  const desktopEntry = 'export function installDesktopMarketSettings(ctx) {'
  const branch = '        const scoped = scopedCtx;'
  const desktopOffset = sources['settings.js'].indexOf(desktopEntry)
  const branchOffset = sources['settings.js'].indexOf(branch, desktopOffset) + branch.length
  return {
    // The presentation belongs to the entry fiber, not desktopPnpm's nested
    // injection fiber; otherwise describe() still auto-generates a second page.
    'index.js': sources['index.js'].replace('installDesktopMarketSettings(desktopCtx);', 'installDesktopMarketSettings(ctx);') + CONFIG,
    'settings.js': sources['settings.js'].slice(0, branchOffset) + DESKTOP_SETTINGS + sources['settings.js'].slice(branchOffset)
  }
}

/**
 * Narrow replay of the Desktop-only compatibility patch in the Harness child.
 * @param {string} dshEntryPath Actual installed Harness CLI entry (including ASAR).
 * @param {(line: string) => void} [note] Non-sensitive adaptation diagnostics.
 */
export function registerMarketSettingsCompatibility(dshEntryPath, note = (line) => process.stderr.write(`${line}\n`)) {
  let host
  try {
    host = JSON.parse(readFileSync(join(dirname(dshEntryPath), '..', 'package.json'), 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
  if (!['0.2.1-rc.2', '0.2.2-rc.1', '0.2.2-rc.5'].includes(host.version)) return undefined
  const packages = new Map()
  return registerHooks({
    load(url, context, nextLoad) {
      if (!url.startsWith('file:')) return nextLoad(url, context)
      const path = fileURLToPath(url)
      const name = basename(path)
      if (!(name in SOURCE_HASHES) || basename(dirname(path)) !== 'lib') return nextLoad(url, context)
      const directory = dirname(dirname(path))
      if (!packages.has(directory)) {
        let adapted
        let auditedPackage = false
        try {
          const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
          if (manifest.name === 'dshmarket' && manifest.version === MARKET_VERSION) {
            auditedPackage = true
            adapted = adaptMarketSettingsSources(Object.fromEntries(Object.keys(SOURCE_HASHES).map((file) => [file, readFileSync(join(directory, 'lib', file), 'utf8')])))
            note(`[desktop] dshmarket ${MARKET_VERSION}: applying verified Desktop settings adapter`)
          }
        } catch (error) {
          // Preserve Node's original loading/error path; never conceal a broken
          // package with a host copy or silently claim an unverified adaptation.
          if (auditedPackage || error?.code !== 'ENOENT') note(`[desktop] market settings adapter at ${directory}: ${error.message}`)
        }
        packages.set(directory, adapted)
      }
      const result = nextLoad(url, context)
      const source = packages.get(directory)?.[name]
      if (source === undefined) return result
      if (sha256(result.source) !== SOURCE_HASHES[name]) {
        throw new Error(`dshmarket settings adapter: ${path} changed after verification`)
      }
      return { ...result, source }
    }
  })
}
