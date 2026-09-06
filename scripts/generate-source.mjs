import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { deflateRawSync } from 'node:zlib'

// A deterministic ZIP of the corresponding source; no browser data or local credentials.
const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const files = []
const roots = ['src', 'public', 'scripts', 'tests', 'docs', '.github']
async function collect(dir) {
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const path = dir + '/' + entry.name
    if (entry.isDirectory()) await collect(path)
    else if (entry.isFile()) files.push(path)
    else throw new Error('Source archives cannot contain symlinks: ' + path)
  }
}
for (const dir of roots) await collect(dir)
files.push(
  'LICENSE',
  'README.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'package.json',
  'package-lock.json',
  'index.html',
  'components.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'wrangler.jsonc',
  '.gitignore',
  '.prettierignore',
  '.prettierrc.json',
)
const table = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
const crc32 = (data) => {
  let crc = 0xffffffff
  for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
const local = [],
  central = []
let offset = 0
for (const file of files.sort()) {
  const name = Buffer.from(
    `storied-${pkg.version}/${relative(root, resolve(root, file)).split(sep).join('/')}`,
  )
  const data = await readFile(resolve(root, file)),
    packed = deflateRawSync(data)
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0x800, 6)
  header.writeUInt16LE(8, 8)
  header.writeUInt16LE(0x5d25, 12) // Stable ZIP date: 2026-09-05.
  header.writeUInt32LE(crc32(data), 14)
  header.writeUInt32LE(packed.length, 18)
  header.writeUInt32LE(data.length, 22)
  header.writeUInt16LE(name.length, 26)
  local.push(header, name, packed)
  const directory = Buffer.alloc(46)
  directory.writeUInt32LE(0x02014b50, 0)
  directory.writeUInt16LE(20, 4)
  header.copy(directory, 6, 4, 30)
  directory.writeUInt32LE(offset, 42)
  central.push(directory, name)
  offset += header.length + name.length + packed.length
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(directory.length, 12)
end.writeUInt32LE(offset, 16)
const archive = Buffer.concat([...local, directory, end])
await writeFile(resolve(root, `dist/storied-source-v${pkg.version}.zip`), archive)
console.log(`Packaged ${files.length} source files (${archive.length} bytes).`)
