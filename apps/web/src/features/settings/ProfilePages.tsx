// Settings › Profile: the hub (Personal Details · Password) and the password form. Personal
// Details is the real V2 preference page (features/members/PersonalSettingsPage.tsx); password
// changes have no endpoint in this build, so the form validates locally and stores nothing.
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Card, LinkCard, LinkCardGrid } from '@/ui/Card'
import { Field, TextInput } from '@/ui/Field'
import { SimulatedAdapterNotice } from './SettingsLayout'

export function ProfileHubPage() {
  return (
    <LinkCardGrid>
      <LinkCard to="/settings/profile/personal-details" title="Personal Details" text="Modify your personal profile details" />
      <LinkCard to="/settings/profile/password" title="Password" text="Update your password" />
    </LinkCardGrid>
  )
}

const MIN_PASSWORD = 12

export function PasswordPage() {
  const id = useId()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  type Errors = { current?: string; next?: string; repeat?: string }
  const [errors, setErrors] = useState<Errors>({})
  const [checked, setChecked] = useState(false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setChecked(false)
    // Each problem is attached to the field it concerns (aria-invalid + described-by via Field).
    const found: Errors = {}
    if (current === '') found.current = 'Enter your current password.'
    if (next.length < MIN_PASSWORD) found.next = `Use at least ${MIN_PASSWORD} characters for the new password.`
    else if (next === current) found.next = 'The new password must differ from the current one.'
    if (next !== repeat) found.repeat = 'The new passwords do not match.'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setChecked(true)
    // AIDEV-NOTE: Deliberately not retained: a password is never written to browser storage.
    setCurrent('')
    setNext('')
    setRepeat('')
  }
  return (
    <>
      <SimulatedAdapterNotice>Password changes are not available in this build. The form checks your entries locally and keeps nothing; use the sign-in page's recovery flow to reset a password.</SimulatedAdapterNotice>
      <Card className="max-w-lg">
        <form className="space-y-6" onSubmit={submit} noValidate>
          <Field id={`${id}-current`} label="Current password" error={errors.current ?? null}>
            <TextInput id={`${id}-current`} type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(event) => setCurrent(event.target.value)} aria-invalid={errors.current ? true : undefined} aria-describedby={errors.current ? `${id}-current-error` : undefined} />
          </Field>
          <Field id={`${id}-new`} label="New Password" hint={`At least ${MIN_PASSWORD} characters.`} error={errors.next ?? null}>
            <TextInput id={`${id}-new`} type="password" autoComplete="new-password" placeholder="New password" value={next} onChange={(event) => setNext(event.target.value)} aria-invalid={errors.next ? true : undefined} aria-describedby={errors.next ? `${id}-new-hint ${id}-new-error` : `${id}-new-hint`} />
          </Field>
          <Field id={`${id}-repeat`} label="Repeat new password" error={errors.repeat ?? null}>
            <TextInput id={`${id}-repeat`} type="password" autoComplete="new-password" placeholder="Repeat password" value={repeat} onChange={(event) => setRepeat(event.target.value)} aria-invalid={errors.repeat ? true : undefined} aria-describedby={errors.repeat ? `${id}-repeat-error` : undefined} />
          </Field>
          {checked && <Callout variant="neutral" role="status">Your entries pass the local checks. No password was changed on the server.</Callout>}
          <Button type="submit" variant="primary">Change Password</Button>
        </form>
      </Card>
    </>
  )
}
