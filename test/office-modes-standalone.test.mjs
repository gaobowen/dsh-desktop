import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createOfficeModes } from 'dsh-ppt'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-office-modes-'))
  roots.push(root)
  return { root, modes: createOfficeModes(root) }
}

it('persists Word/Excel selection and audit through the shared store without applying PPT', async () => {
  const { root, modes } = await fixture()
  const template = { id: 'meeting-minutes', mode: 'word', revision: 'fixture-1' }
  await modes.select('session', 'word')
  await modes.selectTemplate('session', template)
  await modes.record('session', 'office-docx-ready', { sha256: 'fixture' })

  const restored = createOfficeModes(root)
  expect(await restored.state('session')).toMatchObject({ documentMode: 'word', selectedDocumentTemplate: template })
  expect(await readFile(join(root, 'audit.ndjson'), 'utf8')).toContain('office-docx-ready')
  await restored.select('session', 'excel')
  expect(await modes.state('session')).toMatchObject({ documentMode: 'excel' })
  expect((await modes.state('session')).selectedDocumentTemplate).toBeUndefined()
})

it('rejects mismatched template formats without overwriting the current selection', async () => {
  const { modes } = await fixture()
  const template = { id: 'meeting-minutes', mode: 'word', revision: 'fixture-1' }
  await modes.select('session', 'word')
  await modes.selectTemplate('session', template)
  await expect(modes.selectTemplate('session', { id: 'annual-business', mode: 'excel', revision: 'fixture-1' }))
    .rejects.toThrow('matching document format')
  expect(await modes.state('session')).toMatchObject({ documentMode: 'word', selectedDocumentTemplate: template })
  await modes.select('session', null)
  expect((await modes.state('session')).documentMode).toBeUndefined()
})
