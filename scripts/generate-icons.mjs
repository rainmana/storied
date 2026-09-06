import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
function crc32(bytes) {
  let crc = -1
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ -1) >>> 0
}
function chunk(type, body) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([name, body])))
  return Buffer.concat([length, name, body, crc])
}
for (const size of [192, 512]) {
  const pixels = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / size,
        dy = (y - size / 2) / size,
        r = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx),
        ray = Math.abs(Math.sin(angle * 4)) < 0.25 / Math.max(0.5, r * 4)
      const foreground = r < 0.035 || (r > 0.075 && r < 0.28 && ray)
      const color = foreground ? [197, 213, 173, 255] : [32, 41, 30, 255]
      pixels.set(color, y * (size * 4 + 1) + 1 + x * 4)
    }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  writeFileSync(
    `public/icon-${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}
