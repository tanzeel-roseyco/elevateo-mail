import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VIEWPORT_SPECS } from '../../e2e/viewport-specs'

// Guards playwright.config.ts: every spec that reads testInfo.project.name must run under the
// viewport/motion projects, and specs that never read it must not pay for four runs.
// Vitest runs with apps/web as cwd; jsdom gives import.meta.url an http scheme, so resolve from cwd.
const e2eDir = join(process.cwd(), 'e2e')

describe('VIEWPORT_SPECS matches exactly the specs that read the project name', () => {
  const specs = readdirSync(e2eDir).filter((name) => name.endsWith('.spec.ts'))

  it('lists every spec that reads testInfo.project.name', () => {
    const readers = specs.filter((name) => readFileSync(join(e2eDir, name), 'utf8').includes('project.name'))
    expect(readers.length).toBeGreaterThan(0)
    expect(readers.filter((name) => !VIEWPORT_SPECS.test(name))).toEqual([])
  })

  it('lists no spec that ignores the project name', () => {
    const listed = specs.filter((name) => VIEWPORT_SPECS.test(name))
    const nonReaders = listed.filter((name) => !readFileSync(join(e2eDir, name), 'utf8').includes('project.name'))
    expect(nonReaders).toEqual([])
  })
})
