import { useState } from 'react'
import { gateway } from '@/data/gateway'
import { useData } from '@/data/store'
import { EMAIL_PATTERN } from '@/domain/rules'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { confirm } from '@/ui/confirm'
import { Field, Input } from '@/ui/Field'
import { toast } from '@/ui/toast'

const UNAVAILABLE = ['Change password', 'Two-factor authentication', 'Active sessions', 'Delete account']

export function AccountSettings() {
  const profile = useData((s) => s.settings.profile)
  const timezone = useData((s) => s.settings.timezone)
  const updateSettings = useData((s) => s.updateSettings)
  const [form, setForm] = useState(profile)
  const [busy, setBusy] = useState(false)
  const errors = { name: form.name.trim() === '' ? 'Name is required.' : null, email: EMAIL_PATTERN.test(form.email) ? null : 'Enter a valid email address.' }
  const dirty = form.name !== profile.name || form.email !== profile.email

  const reset = async () => {
    if (!(await confirm({ title: 'Reset prototype data?', body: 'All mail, drafts, campaigns, contacts, and settings in this browser return to the demo dataset. Appearance preferences are kept.', confirmLabel: 'Reset data', danger: true }))) return
    setBusy(true)
    try {
      await gateway.resetAll()
      setForm(useData.getState().settings.profile)
      toast('Prototype data was reset.', { tone: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The prototype data could not be reset.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-6">
      <form
        className="flex max-w-md flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (errors.name || errors.email) return
          // The form takes the saved (trimmed) values too, or it would still look unsaved.
          const saved = { name: form.name.trim(), email: form.email.trim() }
          updateSettings({ profile: saved })
          setForm(saved)
          toast('Profile saved.', { tone: 'success' })
        }}
      >
        <h3 className="text-base font-semibold">Profile</h3>
        <Field label="Name" error={errors.name}>{(p) => <Input {...p} value={form.name} maxLength={80} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="Contact email" error={errors.email}>{(p) => <Input {...p} type="email" value={form.email} autoComplete="email" onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <p className="text-[13px] text-muted">Timezone: {timezone}. Change it under Sending and unsubscribe.</p>
        <div>
          <Button type="submit" variant="primary" disabled={!dirty}>
            Save profile
          </Button>
        </div>
      </form>

      <section aria-labelledby="security" className="flex flex-col gap-2 border-t border-line pt-5">
        <h3 id="security" className="flex flex-wrap items-center gap-2 text-base font-semibold">
          Account and security <Badge tone="warn">Prototype — not available</Badge>
        </h3>
        <p className="text-[13px] text-muted">There is no sign-in or server in this prototype, so these actions are shown for layout only and are disabled.</p>
        <div className="flex flex-wrap gap-2">
          {UNAVAILABLE.map((label) => (
            <Button key={label} disabled title="Not available in the prototype">
              {label}
            </Button>
          ))}
        </div>
      </section>

      <section aria-labelledby="prototype-data" className="flex flex-col gap-2 border-t border-line pt-5">
        <h3 id="prototype-data" className="text-base font-semibold">
          Prototype data
        </h3>
        <p className="text-[13px] text-muted">Everything you do here is stored only in this browser. Reset to return to the original demo dataset.</p>
        <div>
          <Button variant="danger" disabled={busy} onClick={() => void reset()}>
            {busy ? 'Resetting…' : 'Reset prototype data'}
          </Button>
        </div>
      </section>
    </div>
  )
}
