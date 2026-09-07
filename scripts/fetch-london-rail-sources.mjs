#!/usr/bin/env node
/** Public, credential-free inputs. Cached files are reused; generated fixtures carry their hashes. */
import { mkdir, readFile, writeFile, access, rename } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
const cache = resolve(process.env.RAIL_CACHE ?? '/tmp/allchange-rail-complete')
const sources = JSON.parse(await readFile(new URL('./london-rail-sources.json', import.meta.url)))
const exists = path => access(path).then(() => true, () => false)
await mkdir(`${cache}/wtt`, { recursive: true })
await mkdir(`${cache}/osm`, { recursive: true })
async function download(url, path, query) {
  if (await exists(path)) return
  const response = await fetch(url, { method: query ? 'POST' : 'GET', body: query, signal: AbortSignal.timeout(180000) })
  if (!response.ok) throw new Error(`${response.status} downloading ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (query && !JSON.parse(bytes).elements) throw new Error('Invalid Overpass response')
  await writeFile(`${path}.partial`, bytes)
  await rename(`${path}.partial`, path)
}
await download(sources.archiveUrl, `${cache}/wtt.zip`)
await writeFile(`${cache}/wtt-manifest.json`, JSON.stringify(sources.tables))
execFileSync('python3', ['-c', `import json,sys,zipfile,pathlib
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(root/'wtt.zip') as archive:
 for table in json.loads((root/'wtt-manifest.json').read_text()):
  (root/'wtt'/(table['table']+'.xlsx')).write_bytes(archive.read(table['member']))
`, cache], { stdio: 'inherit' })
for (const { table } of sources.tables) {
  const cells = execFileSync('python3', ['scripts/read-rail-wtt.py', `${cache}/wtt/${table}.xlsx`, '--all-days'], { maxBuffer: 100 * 1024 * 1024 })
  await writeFile(`${cache}/wtt/${table}.json`, cells)
}
await writeFile(`${cache}/enrt-sources.json`, JSON.stringify(sources.passengerTables))
for (const [table, url] of Object.entries(sources.passengerTables)) {
  const path = `${cache}/NRT${table}.pdf`
  await download(url, path)
  execFileSync('pdftotext', ['-bbox-layout', path, `${cache}/NRT${table}.html`])
  execFileSync('pdftotext', ['-layout', path, `${cache}/NRT${table}.txt`])
}
const elements = new Map()
for (const [tile, query] of Object.entries(sources.geometry)) {
  await writeFile(`${cache}/osm/${tile}.query`, query)
  try { await download('https://overpass.kumi.systems/api/interpreter', `${cache}/osm/${tile}.json`, query) }
  catch { await download('https://overpass-api.de/api/interpreter', `${cache}/osm/${tile}.json`, query) }
  const data = JSON.parse(await readFile(`${cache}/osm/${tile}.json`))
  for (const element of data.elements) {
    if (tile === 'junctions' && (element.type !== 'node' || element.tags?.['ref:tiploc'] !== 'EBSFWJN')) continue
    const key = `${element.type}:${element.id}`
    if (!elements.has(key) || element.tags) elements.set(key, element)
  }
}
await writeFile(`${cache}/osm/combined.json`, JSON.stringify({ elements: [...elements.values()] }))
console.log(`Prepared ${sources.tables.length} WTT tables and ${Object.keys(sources.geometry).length} geometry sources in ${cache}`)
