/** Encode square PNG frames in a Windows ICO container. */
export function encodeIco(frames) {
  const header = Buffer.alloc(6 + frames.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)

  let offset = header.length
  for (const [index, { size, png }] of frames.entries()) {
    const entry = 6 + index * 16
    header.writeUInt8(size % 256, entry)
    header.writeUInt8(size % 256, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  }

  return Buffer.concat([header, ...frames.map(({ png }) => png)])
}
