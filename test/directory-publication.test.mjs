import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { publishDirectory } from '../packages/ppt-runtime/core/lib/directory-publication.js'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-directory-publication-'))
  roots.push(root)
  const source = join(root, 'stage')
  const target = join(root, 'published')
  await mkdir(source)
  await writeFile(join(source, 'document'), 'original')
  return { source, target }
}

it('publishes the complete directory after transient Windows locks release', async () => {
  const { source, target } = await fixture()
  const locked = Object.assign(new Error('scanner lock'), { code: 'EPERM' })
  const move = vi.fn().mockRejectedValueOnce(locked).mockRejectedValueOnce(locked).mockImplementation(rename)
  const delay = vi.fn(async () => {})
  await publishDirectory(source, target, { rename: move, delay, platform: 'win32' })
  expect(await readFile(join(target, 'document'), 'utf8')).toBe('original')
  expect(delay.mock.calls.map(([ms]) => ms)).toEqual([50, 100])
})

it('does not retry over existing user output or retry ordinary filesystem errors', async () => {
  const { source, target } = await fixture()
  await mkdir(target)
  await writeFile(join(target, 'document'), 'user data')
  const locked = Object.assign(new Error('destination occupied'), { code: 'EPERM' })
  const move = vi.fn(async () => { throw locked })
  const delay = vi.fn(async () => {})
  await expect(publishDirectory(source, target, { rename: move, delay, platform: 'win32' })).rejects.toBe(locked)
  expect(delay).not.toHaveBeenCalled()
  expect(await readFile(join(target, 'document'), 'utf8')).toBe('user data')
  const missing = Object.assign(new Error('missing source'), { code: 'ENOENT' })
  await expect(publishDirectory(source, target, { rename: async () => { throw missing }, delay, platform: 'win32' })).rejects.toBe(missing)
  expect(delay).not.toHaveBeenCalled()
})

it('bounds retries and retains the original failure and staged data', async () => {
  const { source, target } = await fixture()
  const locked = Object.assign(new Error('persistent lock'), { code: 'EBUSY' })
  const move = vi.fn(async () => { throw locked })
  const delay = vi.fn(async () => {})
  await expect(publishDirectory(source, target, { rename: move, delay, platform: 'win32' })).rejects.toBe(locked)
  expect(move).toHaveBeenCalledTimes(8)
  expect(delay).toHaveBeenCalledTimes(7)
  expect(await readFile(join(source, 'document'), 'utf8')).toBe('original')
})

it.each(['darwin', 'linux'])('leaves %s rename failures unchanged', async platform => {
  const { source, target } = await fixture()
  const locked = Object.assign(new Error('permission denied'), { code: 'EPERM' })
  const move = vi.fn(async () => { throw locked })
  const delay = vi.fn(async () => {})
  await expect(publishDirectory(source, target, { rename: move, delay, platform })).rejects.toBe(locked)
  expect(move).toHaveBeenCalledOnce()
  expect(delay).not.toHaveBeenCalled()
})
