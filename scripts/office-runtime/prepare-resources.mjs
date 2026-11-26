import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { prepareOfficeRuntime } from './prepare.mjs'
import { prepareOfficeTemplates } from './prepare-templates.mjs'

const project = resolve(import.meta.dirname, '../..')

export async function prepareOfficeResources({
  output = join(project, '.build/office-runtime'),
  runtimeCache,
  templateCache
} = {}) {
  const runtime = resolve(output)
  await mkdir(dirname(runtime), { recursive: true })
  // Keep the lock outside the generated tree, which prepareOfficeRuntime replaces.
  await withFileLock(runtime, async () => {
    await prepareOfficeRuntime({ output: runtime, cache: runtimeCache })
    await prepareOfficeTemplates({ runtime, cache: templateCache })
  }, { waitMs: 10 * 60_000 })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareOfficeResources()
