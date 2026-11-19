import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createOfficeModes } from 'dsh-ppt/office-modes'

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

it('adopts the legacy document choice once without removing existing PPT output', async () => {
  const { root } = await fixture()
  const { root: legacyDocumentRoot, modes: legacy } = await fixture()
  const id = 'restored-session'
  const template = { id: 'meeting-minutes', mode: 'word', revision: 'fixture-1' }
  await legacy.select(id, 'word')
  await legacy.selectTemplate(id, template)
  const session = join(root, 'sessions', createHash('sha256').update(id).digest('hex').slice(0, 32))
  await mkdir(session, { recursive: true })
  const file = join(session, 'state.json')
  const decks = [{ id: 'saved-presentation', output: { storageKey: 'existing.pptx' } }]
  const saved = { sessionId: id, presentationMode: 'ppt', decks }
  await writeFile(file, JSON.stringify(saved))
  const current = createOfficeModes(root, { legacyDocumentRoot })
  expect(await current.state(id)).toEqual({ documentMode: 'word', selectedDocumentTemplate: template })
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(saved)

  await Promise.all([current.select(id, null), createOfficeModes(root, { legacyDocumentRoot }).record(id, 'record-after-clear', {})])
  expect(await createOfficeModes(root, { legacyDocumentRoot }).state(id)).toEqual({})
  const state = JSON.parse(await readFile(file, 'utf8'))
  expect(state.decks).toEqual(decks)
  expect(state.activities.map(activity => activity.operation)).toEqual(['record-after-clear', 'select-document-mode'])
  expect(await legacy.state(id)).toEqual({ documentMode: 'word', selectedDocumentTemplate: template })
})
