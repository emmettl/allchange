import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
const files = new Set(['all-change-rail-led-morning.json', 'all-change-geography.json', 'all-change-diagram.json', 'all-change-surface-day.json'])
for (const manifest of ['all-change-day-manifest.json', 'all-change-bus-day-manifest.json']) {
  files.add(manifest)
  const data = JSON.parse(await readFile(resolve('fixtures/tfl', manifest), 'utf8'))
  for (const { path } of data.chunks) files.add(path)
}
for (const file of files) {
  const output = resolve('public/data', file)
  await mkdir(dirname(output), { recursive: true })
  await copyFile(resolve('fixtures/tfl', file), output)
}
console.log(`Staged ${files.size} All Change artifacts.`)
