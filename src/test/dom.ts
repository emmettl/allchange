/// <reference types="node" />
import { afterEach, beforeEach, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { cleanup, configure } from '@testing-library/react'

// Cold dynamic imports compete with the fixture audits on CI workers.
configure({ asyncUtilTimeout: 3000 })

// DOM tests own state and callbacks. Layout, animation and GPU work stay in E2E.
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({
    media, matches: media.includes('prefers-reduced-motion'), onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  })))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) => kind.startsWith('webgl') ? {} : null) as HTMLCanvasElement['getContext'])
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
