import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeIco } from './ico.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const buildDirectory = path.join(projectRoot, 'build')
const source = path.join(buildDirectory, 'app-icon.png')
const iconsetDirectory = path.join(buildDirectory, 'app-icon.iconset')
const icnsDestination = path.join(buildDirectory, 'icon.icns')
const icoDestination = path.join(buildDirectory, 'icon.ico')

await rm(iconsetDirectory, { recursive: true, force: true })
await mkdir(iconsetDirectory, { recursive: true })

for (const size of [16, 32, 128, 256, 512]) {
  execFileSync('sips', [
    '-z',
    String(size),
    String(size),
    source,
    '--out',
    path.join(iconsetDirectory, `icon_${size}x${size}.png`)
  ])
  execFileSync('sips', [
    '-z',
    String(size * 2),
    String(size * 2),
    source,
    '--out',
    path.join(iconsetDirectory, `icon_${size}x${size}@2x.png`)
  ])
}

execFileSync('iconutil', ['-c', 'icns', iconsetDirectory, '-o', icnsDestination])

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoDirectory = await mkdtemp(path.join(os.tmpdir(), 'dsh-desktop-icons-'))
const icoFrames = []
for (const size of icoSizes) {
  const destination = path.join(icoDirectory, `icon-${size}.png`)
  execFileSync('sips', [
    '-z',
    String(size),
    String(size),
    source,
    '--out',
    destination
  ])
  icoFrames.push({ size, png: await readFile(destination) })
}
await writeFile(icoDestination, encodeIco(icoFrames))
await rm(icoDirectory, { recursive: true, force: true })

const icon = await readFile(source)
console.log(`Generated app icons from ${path.relative(projectRoot, source)} (${icon.length} bytes PNG).`)
