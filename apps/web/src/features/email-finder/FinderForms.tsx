import { useState, type FormEvent } from 'react'
import { Button } from '@/ui/Button'
import { Field, Select, TextInput } from '@/ui/Field'
import { Card } from '@/ui/Card'
import { FinderRequestSchema, type FinderKind } from './contract'

export const FINDER_LABELS: Record<FinderKind, string> = {
  person: 'Person finder', verify: 'Email verifier', company: 'Company emails', decision_maker: 'Decision makers',
}
type Submission = Parameters<typeof FinderRequestSchema.parse>[0]

// AIDEV-NOTE: Native forms provide keyboard validation; the gateway and server repeat boundary validation.
export function FinderForms({ kind, busy, submit, fail }: {
  kind: FinderKind; busy: boolean; submit: (input: Submission) => Promise<void>; fail: (message: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const single = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const input = Object.fromEntries(['name', 'company', 'domain', 'email', 'role'].flatMap((field) => {
      const value = data.get(field)
      return typeof value === 'string' && value.trim() !== '' ? [[field, value.trim()]] : []
    }))
    void submit({ kind, rows: [input], csv: null })
  }
  const bulk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file || file.size > 2_097_152 || file.size === 0) { fail('Choose a non-empty CSV no larger than 2 MB.'); return }
    setReading(true)
    try { await submit({ kind, rows: null, csv: await file.text() }) }
    catch { fail('The CSV could not be read. Choose the file again.') }
    finally { setReading(false) }
  }
  return <div className="grid gap-6 lg:grid-cols-2">
    <Card>
      <h2 className="mb-5 text-base font-medium">{FINDER_LABELS[kind]}</h2>
      <form onSubmit={single} className="space-y-5">
        {kind === 'person' && <Field id="finder-name" label="Full name">
          <TextInput id="finder-name" name="name" required maxLength={200} autoComplete="off" placeholder="Alex Morgan" />
        </Field>}
        {kind === 'verify' ? <Field id="finder-email" label="Email address">
          <TextInput id="finder-email" name="email" type="email" required maxLength={254} autoComplete="off" placeholder="alex@example.com" />
        </Field> : <>
          <Field id="finder-company" label="Company name" hint="Enter a company name or domain below.">
            <TextInput id="finder-company" name="company" maxLength={250} aria-describedby="finder-company-hint" placeholder="Example Company" />
          </Field>
          <Field id="finder-domain" label="Company domain">
            <TextInput id="finder-domain" name="domain" maxLength={253} autoCapitalize="none" placeholder="example.com" />
          </Field>
        </>}
        {kind === 'decision_maker' && <Field id="finder-role" label="Role or title">
          <TextInput id="finder-role" name="role" required maxLength={200} placeholder="Head of Marketing" />
        </Field>}
        <Button type="submit" variant="primary" loading={busy}>Start lookup</Button>
      </form>
    </Card>
    {kind !== 'company' && <Card>
      <h2 className="mb-2 text-base font-medium">Bulk CSV lookup</h2>
      <p className="mb-5 text-sm text-zinc-500">Up to 5,000 rows and 2 MB. Jobs resume automatically after a worker restart.</p>
      <form onSubmit={(event) => { void bulk(event) }} className="space-y-5">
        <Field id="finder-csv" label="CSV file" hint={`Headers: ${kind === 'verify' ? 'email' : kind === 'person' ? 'name,domain (or company)' : 'role,domain (or company)'}. UTF-8 with a header row.`}>
          <TextInput id="finder-csv" type="file" accept=".csv,text/csv" required aria-describedby="finder-csv-hint"
            onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null) }} />
        </Field>
        <Button type="submit" loading={busy || reading}>Upload and queue</Button>
      </form>
    </Card>}
  </div>
}

export function SuppressionForm({ busy, add }: { busy: boolean; add: (kind: 'email' | 'domain' | 'person', value: string) => void }) {
  return <form className="grid items-end gap-4 sm:grid-cols-[150px_1fr_auto]" onSubmit={(event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const kind = form.get('kind')
    const value = form.get('value')
    if ((kind === 'email' || kind === 'domain' || kind === 'person') && typeof value === 'string') add(kind, value)
  }}>
    <Field id="suppression-kind" label="Suppress by"><Select id="suppression-kind" name="kind">
      <option value="email">Email</option><option value="domain">Domain</option><option value="person">Person name</option>
    </Select></Field>
    <Field id="suppression-value" label="Value"><TextInput id="suppression-value" name="value" required maxLength={254} /></Field>
    <Button type="submit" loading={busy}>Add suppression</Button>
  </form>
}
