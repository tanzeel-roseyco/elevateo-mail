// Central session policy for Outreach gateway operations (FE-805). Celeste's pages call the
// gateway directly, so a raw adapter would let a 401 or context_changed from a write lock only
// the local form while the protected subtree stays visible. This wrapper captures the request
// generation at call time and hands every rejection to the SessionProvider's handleError before
// rethrowing, so the one central policy (abort, invalidate, bounded refresh, recovery, retry gate)
// runs exactly as it does for the V1 pages. No second session state exists here.
//
// AIDEV-NOTE: handleError is called even when it returns false (ordinary error): the page then
// renders its own state from the rethrown error, exactly as useProtectedRequest does for V1.
// AIDEV-NOTE: A consumed error (stale generation, current 401, context change) is rethrown too.
// That is safe because every consuming path unmounts or remounts the protected subtree, Celeste's
// read effects abort on context change/unmount and her write handlers abort on unmount, and every
// catch is guarded by `controller.signal.aborted`. Shell.test "stale consumed 401" proves it (REV866).
import type { OutreachGateway } from '@/features/outreach/contract'

export interface SessionPolicy {
  /** Request generation at call time; a later invalidation makes this generation stale. */
  current(): number
  /** Central 401/409 policy; true when the error was consumed by the session controller. */
  handleError(error: unknown, generation: number): boolean
}

type AnyMethod = (...args: never[]) => Promise<unknown>

function policed<F extends AnyMethod>(method: F, policy: SessionPolicy): F {
  const wrapped = (...args: Parameters<F>): Promise<unknown> => {
    const generation = policy.current()
    let pending: Promise<unknown>
    try {
      pending = method(...args)
    } catch (error) {
      // Adapters validate input synchronously; a sync throw gets the same policy as a rejection.
      policy.handleError(error, generation)
      return Promise.reject(error)
    }
    return pending.catch((error: unknown) => {
      policy.handleError(error, generation)
      throw error
    })
  }
  return wrapped as F
}

/** Returns a gateway with the same shape whose every operation reports failures to the policy first. */
export function policeOutreachGateway(gateway: OutreachGateway, policy: SessionPolicy): OutreachGateway {
  const bound = <F extends AnyMethod>(method: F): F => policed(method.bind(gateway) as F, policy)
  return {
    listCampaigns: bound(gateway.listCampaigns),
    getCampaign: bound(gateway.getCampaign),
    createCampaign: bound(gateway.createCampaign),
    updateCampaign: bound(gateway.updateCampaign),
    listLeads: bound(gateway.listLeads),
    addLead: bound(gateway.addLead),
    updateLead: bound(gateway.updateLead),
    listAccounts: bound(gateway.listAccounts),
    getAccount: bound(gateway.getAccount),
    listAnalytics: bound(gateway.listAnalytics),
    // Optional capabilities stay absent when the adapter lacks them: Celeste's pages hide the control.
    // AIDEV-NOTE: FE864 every optional method on OutreachGateway must be listed here. A missing entry
    // silently drops the capability (SequencePage stayed inert when the draft pair was omitted).
    ...(gateway.getLead ? { getLead: bound(gateway.getLead) } : {}),
    ...(gateway.recordConsent ? { recordConsent: bound(gateway.recordConsent) } : {}),
    ...(gateway.getOutreachSequenceDraft ? { getOutreachSequenceDraft: bound(gateway.getOutreachSequenceDraft) } : {}),
    ...(gateway.saveOutreachSequenceDraft ? { saveOutreachSequenceDraft: bound(gateway.saveOutreachSequenceDraft) } : {}),
  }
}
