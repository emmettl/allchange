/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { vi } from 'vitest'

const bytes = new Map<string, string>()
export function fixtureJson<T = unknown>(path: string): T {
  if (!bytes.has(path)) bytes.set(path, readFileSync(resolve(path), 'utf8'))
  return JSON.parse(bytes.get(path)!) as T
}

// Mirror the public names from stage-data without requiring a build before tests.
export function fixtureResponse(url: string): Response {
  const file = url.split('/data/')[1]
  if (!file) throw new Error(`Unexpected test request: ${url}`)
  let path: string
  if (file === 'all-change-national-rail-catalogue.json') {
    const catalogue = fixtureJson<{ stations: unknown[]; corridors: unknown[] }>('fixtures/national-rail/catalogue.json')
    catalogue.stations.push(fixtureJson('fixtures/eurostar/station.json'))
    return Response.json(catalogue)
  }
  if (file === 'all-change-national-rail-network-eurostar.json') path = 'fixtures/eurostar/network.json'
  else if (file.startsWith('all-change-national-rail-network-')) path = `fixtures/national-rail/${file.replace('all-change-national-rail-', '')}`
  else if (file.startsWith('all-change-passenger-demand/')) path = file.replace('all-change-passenger-demand/', 'fixtures/passenger-demand/')
  else if (file.startsWith('all-change-cycle/')) path = file.replace('all-change-cycle/', 'fixtures/cycle-hire/')
  else if (file === 'all-change-night-study.json') path = 'fixtures/night/study.json'
  else if (file === 'all-change-morning-flow.json') path = 'fixtures/morning-flow/study.json'
  else if (/^all-change-(air|road)-/.test(file)) path = `public/data/${file}`
  else path = `fixtures/tfl/${file}`
  // Preserve exact bytes for the progressive loader's SHA-256 verification.
  return new Response(readFileSync(resolve(path)), { headers: { 'content-type': 'application/json' } })
}

export function installFixtureFetch() {
  const overrides = new Map<string, () => Response | Promise<Response>>()
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const override = [...overrides].find(([suffix]) => url.endsWith(suffix))?.[1]
    const response = override ? await override() : fixtureResponse(url)
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return response
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, overrides, requests: (part: string) => fetch.mock.calls.filter(([url]) => String(url).includes(part)) }
}
