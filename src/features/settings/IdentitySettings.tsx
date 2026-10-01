import { Info } from 'lucide-react'
import { useState } from 'react'
import { useData } from '@/data/store'
import type { DomainInfo, Identity, Verification } from '@/domain/schema'
import { Badge, StatusBadge } from '@/ui/Badge'
import { BrandBanner, Callout } from '@/ui/Bits'
import { Button } from '@/ui/Button'
import { Field, Input, Textarea } from '@/ui/Field'
import { toast } from '@/ui/toast'

function Record({ name, state }: { name: string; state: Verification }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px]">
      <span className="font-medium">{name}</span>
      <StatusBadge status={state} />
    </span>
  )
}

function IdentityEditor({ identity, isDefault, brand }: { identity: Identity; isDefault: boolean; brand: string }) {
  const updateIdentity = useData((s) => s.updateIdentity)
  const updateSettings = useData((s) => s.updateSettings)
  const [form, setForm] = useState({ displayName: identity.displayName, signature: identity.signature, banner: identity.banner })
  const dirty = form.displayName !== identity.displayName || form.signature !== identity.signature || form.banner !== identity.banner
  const nameError = form.displayName.trim() === '' ? 'Display name is required.' : null

  return (
    <details className="border-t border-line first:border-t-0">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2">
        <span className="font-medium">{identity.id}</span>
        <span className="text-muted">{identity.displayName}</span>
        {isDefault && <Badge tone="accent">Default sender</Badge>}
        {identity.banner && <Badge>Banner on</Badge>}
      </summary>
      <form
        className="flex flex-col gap-3 px-4 pb-4 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (nameError) return
          // The form takes the saved (trimmed) value too, or it would still look unsaved.
          const saved = { ...form, displayName: form.displayName.trim() }
          updateIdentity(identity.id, saved)
          setForm(saved)
          toast(`Saved ${identity.id}.`, { tone: 'success' })
        }}
      >
        <Field label="Display name" error={nameError}>{(p) => <Input {...p} value={form.displayName} maxLength={80} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />}</Field>
        <Field label="Signature" hint="Added below messages sent from this address.">{(p) => <Textarea {...p} rows={3} value={form.signature} maxLength={600} onChange={(e) => setForm({ ...form, signature: e.target.value })} />}</Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={form.banner} onChange={(e) => setForm({ ...form, banner: e.target.checked })} />
          Include the {brand} banner by default
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={!dirty}>
            Save identity
          </Button>
          <Button disabled={!dirty} onClick={() => setForm({ displayName: identity.displayName, signature: identity.signature, banner: identity.banner })}>
            Cancel
          </Button>
          <Button variant="ghost" disabled={isDefault} onClick={() => { updateSettings({ defaultIdentityId: identity.id }); toast(`${identity.id} is now the default sender.`, { tone: 'success' }) }}>
            {isDefault ? 'Default sender' : 'Make default sender'}
          </Button>
        </div>
      </form>
    </details>
  )
}

function DomainGroup({ info }: { info: DomainInfo }) {
  const identities = useData((s) => s.identities)
  const defaultId = useData((s) => s.settings.defaultIdentityId)
  return (
    <section aria-labelledby={`domain-${info.domain}`} className="rounded-xl border border-line">
      <div className="flex flex-col gap-2.5 border-b border-line bg-surface-2 px-4 py-3">
        <h3 id={`domain-${info.domain}`} className="text-base font-semibold">
          {info.brand} <span className="font-normal text-muted">· {info.domain}</span>
        </h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Record name="SPF" state={info.spf} />
          <Record name="DKIM" state={info.dkim} />
          <Record name="DMARC" state={info.dmarc} />
          <Badge>Mock data</Badge>
        </div>
        <div className="max-w-md">
          <p className="mb-1 text-xs text-muted">Brand banner preview (used only on {info.brand} mail when enabled)</p>
          <BrandBanner domain={info.domain} text={info.bannerText} />
        </div>
      </div>
      {identities.filter((i) => i.domain === info.domain).map((i) => (
        <IdentityEditor key={i.id} identity={i} isDefault={i.id === defaultId} brand={info.brand} />
      ))}
    </section>
  )
}

export function IdentitySettings() {
  const domains = useData((s) => s.domains)
  return (
    <div className="mt-4 flex flex-col gap-4">
      <Callout tone="info" icon={Info}>
        Nine sending identities share one inbox. Verification statuses below are mock data; the prototype does not read or change DNS.
      </Callout>
      {domains.map((d) => (
        <DomainGroup key={d.domain} info={d} />
      ))}
    </div>
  )
}
