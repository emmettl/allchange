import { enrichAirEndpoints } from '@motionstudies/data/air-endpoints'

const [heatmapDirectory, airportCsvPath] = process.argv.slice(2)
if (!heatmapDirectory || !airportCsvPath) throw new Error('Usage: npm run data:air:routes -- /path/to/cached-heatmaps /path/to/airports.csv')
console.log(await enrichAirEndpoints({
  manifestPath: 'public/data/all-change-air-day-manifest.json',
  snapshotPaths: ['public/data/all-change-air-morning.json'],
  heatmapDirectory, airportCsvPath, utcOffsetHours: 1,
}))
