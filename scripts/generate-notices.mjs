import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'))
const sections = [
  'STORIED — OPEN SOURCE NOTICES\n\nStoried is licensed GPL-3.0-or-later.\nMatching source archive: /storied-source-v0.1.0.zip on this installation.\nRepository: https://github.com/rainmana/storied\n\n' +
    readFileSync(resolve(root, 'LICENSE'), 'utf8'),
  'Original Quiet Tide demo fiction and Storied artwork are also offered under CC0-1.0.\nOptional model weights are downloaded separately and retain their upstream licenses.\nThe following notices are copied from installed runtime dependency packages, including some Node-only packages not used by the browser build.',
]
for (const [directory, metadata] of Object.entries(lock.packages).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (!directory || metadata.dev || !existsSync(resolve(root, directory, 'package.json'))) continue
  const location = resolve(root, directory)
  const pkg = JSON.parse(readFileSync(resolve(location, 'package.json'), 'utf8'))
  const files = readdirSync(location, { withFileTypes: true })
    .filter((f) => f.isFile() && /^(licen[sc]e|copying|copyright|notice)([.-].*)?$/i.test(f.name))
    .map((f) => f.name)
    .sort()
  const notices = files.map((name) => `${name}\n\n${readFileSync(resolve(location, name), 'utf8')}`)
  sections.push(
    `${pkg.name} ${pkg.version}\nLicense: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license || metadata.license || 'See upstream package')}\n${notices.join('\n\n') || `Upstream package: https://www.npmjs.com/package/${pkg.name}`}`,
  )
}
writeFileSync(
  resolve(root, 'public/third-party-notices.txt'),
  sections.join('\n\n' + '='.repeat(72) + '\n\n').replace(/\r\n/g, '\n'),
)
console.log(`Bundled ${sections.length - 2} runtime package notices.`)
