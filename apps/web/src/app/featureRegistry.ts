// Pure, React-free registration seam for feature modules (FE-805). Mira (inbox), Celeste
// (outreach) and Lyra (members) export FeatureRegistration values; App.tsx turns the registry into
// routes and Sidebar.tsx into section links. Navigation and filter state stay in the URL: a
// registration names a path and a section, never component state.
//
// AIDEV-NOTE: Validation is deliberate and fails loud at module load, so a duplicate or malformed
// path from one worker breaks the build/test run instead of silently shadowing another route.

/** Sidebar sections are independent lists; there is no global personal/outreach state switch. */
export type FeatureSection = 'personal' | 'outreach'

export interface FeatureNavEntry {
  /** Absolute hash-router path, for example `/outreach/campaigns`. Must be unique. */
  readonly path: string
  readonly label: string
  readonly section: FeatureSection
  /** Lower sorts first inside its section; ties keep registration order. */
  readonly order: number
}

export interface FeatureRegistration {
  /** Stable owner id, for example `celeste-outreach`; unique across the registry. */
  readonly id: string
  /** Route paths this module renders, including any not shown in the sidebar. */
  readonly routes: readonly string[]
  readonly nav: readonly FeatureNavEntry[]
}

export class FeatureRegistryError extends Error {
  override readonly name = 'FeatureRegistryError'
}

const ROUTE_PATH = /^\/[a-z0-9-]+(?:\/(?:[a-z0-9-]+|:[a-zA-Z][a-zA-Z0-9]*))*$/

/** Only lowercase static segments and `:param` segments; no query, hash, trailing slash or `*`. */
export function isValidRoutePath(path: string): boolean {
  return ROUTE_PATH.test(path)
}

export interface FeatureRegistry {
  readonly modules: readonly FeatureRegistration[]
  readonly navBySection: Readonly<Record<FeatureSection, readonly FeatureNavEntry[]>>
}

/** Build the registry; throws FeatureRegistryError on duplicate ids/paths or malformed paths. */
export function buildFeatureRegistry(modules: readonly FeatureRegistration[]): FeatureRegistry {
  const ids = new Set<string>()
  const paths = new Set<string>()
  for (const module of modules) {
    if (module.id === '' || ids.has(module.id)) throw new FeatureRegistryError(`Duplicate or empty feature id: "${module.id}"`)
    ids.add(module.id)
    for (const path of module.routes) {
      if (!isValidRoutePath(path)) throw new FeatureRegistryError(`Feature "${module.id}" has an invalid route path: "${path}"`)
      if (paths.has(path)) throw new FeatureRegistryError(`Feature "${module.id}" re-registers route path: "${path}"`)
      paths.add(path)
    }
    for (const entry of module.nav) {
      if (!module.routes.includes(entry.path)) {
        throw new FeatureRegistryError(`Feature "${module.id}" nav entry "${entry.path}" has no matching route`)
      }
      if (entry.label.trim() === '') throw new FeatureRegistryError(`Feature "${module.id}" nav entry "${entry.path}" has an empty label`)
    }
  }
  const bySection: Record<FeatureSection, FeatureNavEntry[]> = { personal: [], outreach: [] }
  for (const module of modules) for (const entry of module.nav) bySection[entry.section].push(entry)
  // Array.prototype.sort is stable (ES2019+), so equal orders keep registration order.
  for (const section of Object.keys(bySection) as FeatureSection[]) bySection[section].sort((a, b) => a.order - b.order)
  return { modules, navBySection: bySection }
}
