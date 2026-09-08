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
await copyFile(resolve('fixtures/national-rail/paddington.json'), resolve('public/data/all-change-national-rail-paddington.json'))
await copyFile(resolve('fixtures/national-rail/waterloo.json'), resolve('public/data/all-change-national-rail-waterloo.json'))
await copyFile(resolve('fixtures/national-rail/kings-cross.json'), resolve('public/data/all-change-national-rail-kings-cross.json'))

const railCatalogue = JSON.parse(await readFile('fixtures/national-rail/catalogue.json', 'utf8'))
await copyFile('fixtures/national-rail/catalogue.json', 'public/data/all-change-national-rail-catalogue.json')
for (const corridor of railCatalogue.corridors) await copyFile(`fixtures/national-rail/network-${corridor.id}.json`, `public/data/${corridor.file}`)

await copyFile('fixtures/passenger-demand/numbat-2025-friday.json', 'public/data/all-change-passenger-demand.json')
