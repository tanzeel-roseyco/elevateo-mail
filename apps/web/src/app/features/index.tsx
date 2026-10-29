// Feature module registration (FE-805). This is the single place where owner exports are bound to
// shell routes and sidebar sections. Owners export modules/pages from their own paths; Fable wires
// them here with the session context, CSRF proof and the optional feature gateways.
//
// AIDEV-NOTE: Owner modules carry static elements. Celeste's pages take gateway/context/proof as
// props, so each Outreach route is a thin wrapper that reads session state and builds her element;
// Lyra's module reads the session itself and is registered verbatim.
import { useMemo, type ReactElement } from 'react'
import { useProtectedRequest } from '../protectedRequest'
import { policeOutreachGateway } from '../outreachSessionPolicy'
import { useSession } from '../session'
import { useFeatureGateways } from '../featureGateways'
import { buildFeatureRegistry, type FeatureRegistration } from '../featureRegistry'
import { createOutreachFeatureModule } from '@/features/outreach/featureModule'
import type { OutreachPageProps } from '@/features/outreach/OutreachPages'
import { peopleFeatureModule } from '@/features/members/peopleFeatureModule'
import { emailFinderFeatureModule } from '@/features/email-finder/featureModule'

export interface FeatureModule extends FeatureRegistration {
  /** One element per registered route path; keys must equal `routes` exactly. */
  readonly elements: Readonly<Record<string, ReactElement>>
}

// --- Outreach (Celeste FE-807) -------------------------------------------------------------
// exactOptionalPropertyTypes forbids passing `undefined` explicitly, hence the conditional spreads.
function useOutreachProps(): OutreachPageProps {
  const { context, proof } = useProtectedRequest()
  const { scope, handleError } = useSession()
  const { outreach: raw } = useFeatureGateways()
  // AIDEV-NOTE: FE-805 central session policy. Celeste's pages call the gateway directly, so every
  // operation is policed through SessionProvider.handleError (401 -> restoring access, 409 -> recovery).
  // Memoised on the injected port and the stable session callbacks: the binding does not change per
  // render, and the generation is read at call time, so no rebinding is needed on an epoch change.
  const outreach = useMemo(
    () => (raw === undefined ? undefined : policeOutreachGateway(raw, { current: () => scope.current(), handleError })),
    [raw, scope, handleError],
  )
  return {
    ...(outreach === undefined ? {} : { gateway: outreach }),
    ...(context === null ? {} : { context }),
    ...(proof === null ? {} : { proof }),
  }
}

/** Renders Celeste's element for one path with live session props; her page owns the rest. */
function OutreachRoute({ path }: { path: string }) {
  const element = createOutreachFeatureModule(useOutreachProps()).elements[path]
  if (element === undefined) throw new Error(`Outreach module has no element for "${path}"`)
  return element
}

const outreachShape = createOutreachFeatureModule({})
const outreach: FeatureModule = {
  id: outreachShape.id,
  routes: outreachShape.routes,
  nav: outreachShape.nav,
  elements: Object.fromEntries(outreachShape.routes.map((path) => [path, <OutreachRoute key={path} path={path} />])),
}

// --- People and settings (Lyra FE-808): personal section, session-bound pages ---------------
export const FEATURE_MODULES: readonly FeatureModule[] = [outreach, peopleFeatureModule, emailFinderFeatureModule]

/** Validated at module load: a bad registration fails the build/test run rather than the user. */
export const featureRegistry = buildFeatureRegistry(FEATURE_MODULES)

for (const module of FEATURE_MODULES) {
  const keys = Object.keys(module.elements).sort()
  const routes = [...module.routes].sort()
  if (keys.length !== routes.length || keys.some((key, i) => key !== routes[i])) {
    throw new Error(`Feature "${module.id}" elements must map exactly its routes`)
  }
}

/** Flat route list for App.tsx. */
export const featureRoutes: ReadonlyArray<{ path: string; element: ReactElement }> = FEATURE_MODULES.flatMap((module) =>
  module.routes.map((path) => ({ path, element: module.elements[path] as ReactElement })),
)
