import { copyFile, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises'
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
railCatalogue.stations.push(JSON.parse(await readFile('fixtures/eurostar/station.json', 'utf8')))
const eurostar = JSON.parse(await readFile('fixtures/eurostar/network.json', 'utf8'))
if (eurostar.metadata.serviceDate !== railCatalogue.serviceDate) throw new Error('Rail source dates differ')
await copyFile('fixtures/eurostar/network.json', 'public/data/all-change-national-rail-network-eurostar.json')
for (const corridor of railCatalogue.corridors) await copyFile(`fixtures/national-rail/network-${corridor.id}.json`, `public/data/${corridor.file}`)
railCatalogue.corridors.push({ id: 'eurostar', file: 'all-change-national-rail-network-eurostar.json', journeys: eurostar.trains.length, stations: 1 })
await writeFile('public/data/all-change-national-rail-catalogue.json', JSON.stringify(railCatalogue))

await rm('public/data/all-change-passenger-demand.json', { force: true })
await rm('public/data/all-change-passenger-demand', { recursive: true, force: true })
await mkdir('public/data/all-change-passenger-demand', { recursive: true })
await copyFile('fixtures/passenger-demand/catalogue.json', 'public/data/all-change-passenger-demand/catalogue.json')
await cp('fixtures/passenger-demand/stations', 'public/data/all-change-passenger-demand/stations', { recursive: true })
await cp('fixtures/passenger-demand/preceding', 'public/data/all-change-passenger-demand/preceding', { recursive: true })
await rm('public/data/all-change-cycle-day.json', { force: true })
await mkdir('public/data/all-change-cycle', { recursive: true })
await copyFile('fixtures/cycle-hire/manifest.json', 'public/data/all-change-cycle/manifest.json')
await cp('fixtures/cycle-hire/days', 'public/data/all-change-cycle/days', { recursive: true })
await cp('fixtures/cycle-hire/profiles', 'public/data/all-change-cycle/profiles', { recursive: true })

const night = JSON.parse(await readFile('fixtures/night/study.json', 'utf8'))
// Keep the reproducibility ledger and redundant station names in the source
// fixture. Cards already receive their selected station's name from the app.
delete night.audit
for (const profile of Object.values(night.profiles)) delete profile.name
await writeFile('public/data/all-change-night-study.json', JSON.stringify(night))

await copyFile('fixtures/morning-flow/study.json', 'public/data/all-change-morning-flow.json')
