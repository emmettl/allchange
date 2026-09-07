import { createHash } from 'node:crypto'
import { access, lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { moduleReferences } from './module-references.mjs'

const root = resolve('.')
const manifest = JSON.parse(await readFile('package.json', 'utf8'))
const candidates = JSON.parse(await readFile('vendor/manifest.json', 'utf8'))
const declared = { ...manifest.dependencies, ...manifest.devDependencies }
if (manifest.workspaces) throw new Error('An edition must consume installed packages, not workspaces')
try { await access('packages'); throw new Error('Shared package source belongs in Motion Studies') }
catch (error) { if (error.code !== 'ENOENT') throw error }
const exported = new Map()
for (const [name, candidate] of Object.entries(candidates.packages)) {
  if (declared[name] !== `file:vendor/${candidate.file}`) throw new Error(`Candidate dependency drift: ${name}`)
  const bytes = await readFile(`vendor/${candidate.file}`)
  if (createHash('sha256').update(bytes).digest('hex') !== candidate.sha256) throw new Error(`Candidate hash mismatch: ${name}`)
  const installed = resolve('node_modules', name)
  if ((await lstat(installed)).isSymbolicLink() || !(await realpath(installed)).startsWith(`${await realpath('node_modules')}${sep}`)) throw new Error(`Shared source link: ${name}`)
  exported.set(name, JSON.parse(await readFile(`${installed}/package.json`, 'utf8')).exports)
}
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name)
    if (entry.isDirectory()) { await visit(file); continue }
    if (!/\.(?:[cm]?[jt]sx?|css)$/.test(file)) continue
    for (const reference of moduleReferences(await readFile(file, 'utf8'), file)) {
      if (reference === undefined) throw new Error(`Unverifiable module reference in ${file}`)
      if (/^https?:/.test(reference) && extname(file) === '.css') continue
      if (reference.startsWith('.')) {
        const target = relative(root, resolve(dirname(file), reference))
        if (target === '..' || target.startsWith(`..${sep}`)) throw new Error(`${file} imports outside this repository`)
      } else {
        if (reference.startsWith('node:') || builtinModules.includes(reference)) continue
        const name = reference.startsWith('@') ? reference.split('/').slice(0, 2).join('/') : reference.split('/')[0]
        if (!declared[name]) throw new Error(`Undeclared dependency ${name} in ${file}`)
        if (exported.has(name) && !Object.hasOwn(exported.get(name), `.${reference.slice(name.length)}`)) throw new Error(`Private package import: ${reference}`)
      }
    }
  }
}
for (const directory of ['src', 'scripts', 'london-worker']) await visit(directory)
console.log('All Change uses verified compiled candidates and declared public imports.')
