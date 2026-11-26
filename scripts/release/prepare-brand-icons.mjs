import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { encodeIco } from './ico.mjs'

const mark = await readFile(new URL('../../build/vina-brand-mark.svg', import.meta.url), 'utf8')
const directory = new URL('../../.build/brand-assets/', import.meta.url)

// A dark tile keeps the light mark legible against either Windows theme.
const artwork = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <style>
      #startup path { fill: #fafafb; }
      #startup .upper-left { fill: #e1e4e9; }
      #startup .upper-right { fill: #b8bec7; }
      #startup .lower-right { fill: #e9ecf0; }
    </style>
    <rect x="1" y="1" width="38" height="38" rx="9" fill="#18191c" stroke="#6d7178" />
    <g transform="translate(1.5 5)">${mark}</g>
  </svg>
`)
const sizes = [16, 20, 24, 32, 40, 48, 64, 256]
const rasterize = size => sharp(artwork, { density: 512 }).resize(size, size).png().toBuffer()
const [frames, mobileIcon] = await Promise.all([
  Promise.all(sizes.map(async size => ({ size, png: await rasterize(size) }))),
  rasterize(180)
])

await mkdir(directory, { recursive: true })
await Promise.all([
  writeFile(new URL('windows-icon.ico', directory), encodeIco(frames)),
  writeFile(new URL('mobile-icon.png', directory), mobileIcon)
])
