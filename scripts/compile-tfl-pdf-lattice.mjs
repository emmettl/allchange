#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractPdfText, compileTflPdfProof, fetchBytes } from './ingest-tfl-pdf-timetable.mjs'
import { parseClock } from './ingest-tfl-line.mjs'
import { mergeNetworkSnapshots } from './merge-network-snapshots.mjs'

const SOURCES = {
  elizabeth: {
    file: 'elizabeth.pdf',
    url: 'https://content.tfl.gov.uk/elizabeth-line-17-may-12-december-2026.pdf',
    validUntil: '2026-12-12',
    sections: { outbound: 'Elizabeth line – Westbound', inbound: 'Elizabeth line – Eastbound' },
  },
  liberty: {
    file: 'liberty.pdf',
    url: 'https://tfl.gov.uk/cdn/static/cms/documents/lo-liberty-line-timetable-may-2026.pdf',
    sections: { outbound: 'Liberty line eastbound', inbound: 'Liberty line westbound' },
  },
  lioness: {
    file: 'lioness.pdf',
    url: 'https://content.tfl.gov.uk/lo-lioness-line-timetable-may-2026.pdf',
    sections: { outbound: 'Lioness line northbound', inbound: 'Lioness line southbound' },
  },
  mildmay: {
    file: 'mildmay.pdf',
    url: 'https://tfl.gov.uk/cdn/static/cms/documents/lo-mildmay-line-timetable-may-2026.pdf',
    sections: { outbound: 'Mildmay line westbound', inbound: 'Mildmay line eastbound' },
  },
  suffragette: {
    file: 'suffragette.pdf',
    url: 'https://tfl.gov.uk/cdn/static/cms/documents/lo-suffragette-line-timetable-may-2026.pdf',
    sections: { outbound: 'Suffragette line eastbound', inbound: 'Suffragette line westbound' },
  },
  weaver: {
    file: 'weaver.pdf',
    url: 'https://tfl.gov.uk/cdn/static/cms/documents/lo-weaver-line-timetable-may-2026.pdf',
    sections: { outbound: 'Weaver line northbound', inbound: 'Weaver line southbound' },
  },
  windrush: {
    file: 'windrush.pdf',
    url: 'https://tfl.gov.uk/cdn/static/cms/documents/lo-windrush-line-timetable-may-2026.pdf',
    sections: { outbound: 'Windrush line southbound', inbound: 'Windrush line northbound' },
  },
}

function argument(argv, name, fallback) {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}

function apiUrl(path) {
  const url = new URL(path, 'https://api.tfl.gov.uk')
  if (process.env.TFL_API_KEY) url.searchParams.set('app_key', process.env.TFL_API_KEY)
  return url
}

async function fetchJson(path) {
  const url = apiUrl(path)
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(url, {
      headers: { 'user-agent': 'Motion Studies data compiler (offline research)' },
    })
    if (response.ok) return response.json()
    if (response.status !== 429 || attempt === 6) {
      throw new Error(`TfL request failed (${response.status}) for ${url.origin}${url.pathname}`)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1500))
  }
}

export function planPdfCoverage(catalogue, modes = ['overground', 'elizabeth-line']) {
  const selectedModes = new Set(modes)
  return catalogue.lines
    .filter(({ mode, id }) => selectedModes.has(mode) && SOURCES[id])
    .flatMap((line) => line.directions.flatMap((direction) => direction.branches.map((branch) => ({
      lineId: line.id,
      lineName: line.name,
      mode: line.mode,
      direction: direction.direction,
      originId: branch.stopIds[0],
      destinationId: branch.stopIds.at(-1),
      sectionTitle: SOURCES[line.id].sections[direction.direction],
      advertisedStopCount: branch.stopIds.length,
    }))))
}

/** A topology branch may describe only part of another branch's same service.
 * Keep the maximal calling sequence, using exact station IDs and clocks so
 * separate platforms or nearby departures never collapse into one train. */
export function uniquePdfJourneys(trains) {
  const retained = []
  const containing = new Map()
  const callKey = call => call.join(':')
  for (const train of [...trains].sort((a, b) => b.stops.length - a.stops.length)) {
    const calls = train.stops.map(callKey)
    const key = `${train.route}|${calls[0]}`
    const candidates = containing.get(key) ?? []
    if (candidates.some(parent => {
      const start = parent.indexOf(calls[0])
      return calls.every((call, index) => parent[start + index] === call)
    })) continue
    retained.push(train)
    for (const call of calls) {
      const key = `${train.route}|${call}`
      const parents = containing.get(key) ?? []
      parents.push(calls)
      containing.set(key, parents)
    }
  }
  const unique = new Set(retained)
  return trains.filter(train => unique.has(train))
}

export async function compilePdfLattice({
  catalogue,
  serviceDate,
  retrievedAt = new Date().toISOString(),
  windowStart = parseClock('06:45'),
  windowEnd = parseClock('08:45'),
  modes = ['overground', 'elizabeth-line'],
  loadJson = fetchJson,
  loadPdf = async (source) => fetchBytes(source.url),
}) {
  const plan = planPdfCoverage(catalogue, modes)
  if (!plan.length) throw new Error('TfL catalogue produced no PDF coverage tasks')

  const lineIds = [...new Set(plan.map(({ lineId }) => lineId))]
  const pdfByLine = new Map(await Promise.all(lineIds.map(async (lineId) => {
    const bytes = await loadPdf(SOURCES[lineId])
    // Fixed physical spacing keeps Elizabeth's proportional-font rows in
    // the same timetable columns even where pdftotext would compress blanks.
    return [lineId, { bytes, text: await extractPdfText(bytes, 1, 1000, lineId === 'elizabeth' ? { fixedPitch: 3 } : {}) }]
  })))
  const routeByDirection = new Map()
  for (const task of plan) {
    const key = `${task.lineId}:${task.direction}`
    if (!routeByDirection.has(key)) {
      routeByDirection.set(key, await loadJson(`/Line/${task.lineId}/Route/Sequence/${task.direction}`))
    }
  }

  const snapshots = []
  const inactiveBranches = []
  for (const task of plan) {
    const source = SOURCES[task.lineId]
    const { bytes, text } = pdfByLine.get(task.lineId)
    const routePath = `/Line/${task.lineId}/Route/Sequence/${task.direction}`
    try {
      snapshots.push(compileTflPdfProof({
        routeSequence: routeByDirection.get(`${task.lineId}:${task.direction}`),
        pdfText: text,
        pdfBytes: bytes,
        pdfUrl: source.url,
        serviceDate,
        originId: task.originId,
        destinationId: task.destinationId,
        sectionTitle: task.sectionTitle,
        retrievedAt,
        routeUrl: `${apiUrl(routePath).origin}${apiUrl(routePath).pathname}`,
        validFrom: '2026-05-17',
        validUntil: source.validUntil,
        windowStart,
        windowEnd,
        allowSkippedStops: true,
      }))
    } catch (error) {
      if (!error.message.includes('produced no auditable journeys')) throw error
      inactiveBranches.push({ ...task, reason: error.message })
    }
  }
  if (!snapshots.length) throw new Error('TfL PDF coverage plan produced no active movement snapshots')

  const merged = mergeNetworkSnapshots(snapshots, {
    retrievedAt,
    note: 'Every advertised London Overground and Elizabeth line branch was audited against the current TfL public timetable PDFs. Active weekday branch patterns are compiled; topology-only or non-through branches are recorded explicitly.',
  })
  const originalCount = merged.trains.length
  merged.trains = uniquePdfJourneys(merged.trains)
  merged.metadata.journeyDeduplication = {
    model: 'Exact contiguous station/time subjourneys retain the longest published service',
    removed: originalCount - merged.trains.length,
  }
  merged.metadata.coverage = {
    status: inactiveBranches.length ? 'audited-with-inactive-branches' : 'complete-active-branch-family',
    modes,
    lineCount: lineIds.length,
    directionCount: new Set(plan.map(({ lineId, direction }) => `${lineId}:${direction}`)).size,
    advertisedBranchCount: plan.length,
    compiledBranchCount: snapshots.length,
    inactiveBranches,
  }
  return merged
}

async function main() {
  const argv = process.argv.slice(2)
  const catalogue = JSON.parse(await readFile(resolve(argument(argv, 'catalogue', 'fixtures/tfl/all-change-rail-led-catalogue.json')), 'utf8'))
  const pdfDirectory = argument(argv, 'pdf-dir')
  const output = argument(argv, 'output', 'fixtures/tfl/all-change-pdf-morning.json')
  const lattice = await compilePdfLattice({
    catalogue,
    serviceDate: argument(argv, 'service-date', '2026-09-04'),
    retrievedAt: argument(argv, 'retrieved-at', new Date().toISOString()),
    windowStart: parseClock(argument(argv, 'window-start', '06:45')),
    windowEnd: parseClock(argument(argv, 'window-end', '08:45')),
    modes: argument(argv, 'modes', 'overground,elizabeth-line').split(',').filter(Boolean),
    loadPdf: pdfDirectory
      ? async ({ file }) => readFile(join(resolve(pdfDirectory), file))
      : undefined,
  })
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), `${JSON.stringify(lattice)}\n`)
  console.log(`Wrote ${output}: ${lattice.trains.length} journeys / ${lattice.stops.length} stops / ${lattice.paths.length} paths / ${lattice.metadata.coverage.compiledBranchCount} active branches`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
