import { AlertTriangle, CheckCircle2, ChevronRight, Info } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { gateway } from '@/data/gateway'
import { useData } from '@/data/store'
import { IMPORT_COLUMNS, validateImport } from '@/domain/csv'
import { Badge } from '@/ui/Badge'
import { Callout, usePageTitle } from '@/ui/Bits'
import { Button, buttonClass } from '@/ui/Button'
import { Textarea } from '@/ui/Field'
import { toast } from '@/ui/toast'

const MAX_CSV_BYTES = 1_000_000

// Deliberately includes an invalid address, a missing name, a no-consent row and a duplicate to show validation.
const SAMPLE = `name,email,company,tags,consent
Marguerite Halvorsen,marguerite.halvorsen@fjordline-freight.example,Fjordline Freight,Logistics;Q4 priority,yes
Desmond Achterberg,desmond@cobalt-ridge-capital.example,Cobalt Ridge Capital,Fintech,yes
Ines Navarrete,ines.navarrete[at]solano-health.example,Solano Health,Healthcare,yes
,owner@quietwater-labs.example,Quietwater Labs,SaaS,yes
Theo Blackwood,theo.blackwood@anvil-foundry.example,Anvil Foundry,Manufacturing,no
Desmond Achterberg,desmond@cobalt-ridge-capital.example,Cobalt Ridge Capital,Fintech,yes
`

type Phase = { kind: 'edit' } | { kind: 'importing' } | { kind: 'done'; added: number }

/** Mock CSV import: paste or choose a file, preview every row with its validation result, import the valid ones. */
export function ImportPage() {
  usePageTitle('Import contacts')
  const contacts = useData((s) => s.contacts)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'edit' })
  const fileRef = useRef<HTMLInputElement>(null)

  const existing = useMemo(() => new Set(contacts.map((c) => c.email.toLowerCase())), [contacts])
  const result = useMemo(() => (text.trim() ? validateImport(text, existing) : null), [text, existing])
  const valid = result?.ok ? result.rows.filter((r) => r.errors.length === 0) : []
  const invalidCount = result?.ok ? result.rows.length - valid.length : 0

  const readFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_CSV_BYTES) return toast('That file is larger than 1 MB. Split it into smaller files.', { tone: 'error' })
    try {
      setText(await file.text())
    } catch {
      toast('That file could not be read. Check it is a CSV file and try again.', { tone: 'error' })
    }
  }

  // Input is locked while an import runs: finishing clears the box, which would discard anything typed meanwhile.
  const importing = phase.kind === 'importing'

  const runImport = async () => {
    setPhase({ kind: 'importing' })
    try {
      const { added } = await gateway.importContacts(valid.map(({ name, email, company, tags, consent }) => ({ name, email, company, tags, consent })))
      setPhase({ kind: 'done', added })
      setText('')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The import failed.', { tone: 'error' })
      setPhase({ kind: 'edit' })
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="border-b border-line px-4 py-3 md:px-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] text-muted">
          <Link to="/contacts" className="underline underline-offset-2 hover:text-fg">
            Contacts
          </Link>
          <ChevronRight aria-hidden className="size-3.5" />
          <span aria-current="page" className="text-fg">
            Import CSV
          </span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Import contacts</h1>
      </header>

      <div className="flex max-w-4xl flex-col gap-4 p-4 md:p-6">
        {phase.kind === 'done' ? (
          <div role="status" className="flex flex-col items-start gap-3">
            <Callout tone="info" icon={CheckCircle2}>
              <strong>
                {phase.added} contact{phase.added === 1 ? '' : 's'} imported.
              </strong>{' '}
              They are stored only in this browser.
            </Callout>
            <div className="flex gap-2">
              <Link to="/contacts" className={buttonClass('primary')}>
                View contacts
              </Link>
              <Button onClick={() => setPhase({ kind: 'edit' })}>Import another file</Button>
            </div>
          </div>
        ) : (
          <>
            <Callout tone="info" icon={Info}>
              Required columns: <code>{IMPORT_COLUMNS.join(', ')}</code>. Separate multiple tags with a semicolon. Rows without opt-in consent (<code>yes</code>) are rejected. The file is read in your browser and never uploaded.
            </Callout>
            <div className="flex flex-wrap gap-2">
              <Button disabled={importing} onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = '' }} />
              <Button disabled={importing} onClick={() => setText(SAMPLE)}>Load sample CSV</Button>
              {text && <Button variant="ghost" disabled={importing} onClick={() => setText('')}>Clear</Button>}
            </div>
            <label htmlFor="csv-text" className="text-[13px] font-medium">
              CSV content
            </label>
            <Textarea id="csv-text" rows={6} disabled={importing} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste CSV here, or choose a file" className="-mt-3 font-mono text-xs" spellCheck={false} />

            {result && !result.ok && (
              <Callout tone="danger" icon={AlertTriangle}>
                <span role="alert">{result.error}</span>
              </Callout>
            )}

            {result?.ok && (
              <section aria-labelledby="import-preview" className="flex flex-col gap-3">
                <h2 id="import-preview" className="text-base font-semibold">
                  Preview
                </h2>
                <p aria-live="polite" className="text-[13px]">
                  <strong>{valid.length}</strong> row{valid.length === 1 ? '' : 's'} ready to import, <strong>{invalidCount}</strong> with errors (skipped).
                </p>
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full min-w-[640px] text-left text-[13px]">
                    <caption className="sr-only">Import preview with validation results</caption>
                    <thead className="bg-surface-2 text-xs text-muted">
                      <tr>
                        {['Line', 'Name', 'Email', 'Company', 'Result'].map((h) => (
                          <th key={h} scope="col" className="px-3 py-2 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 200).map((r) => (
                        <tr key={r.line} className="border-t border-line align-top">
                          <td className="px-3 py-1.5 tabular-nums text-muted">{r.line}</td>
                          <td className="px-3 py-1.5">{r.name || '—'}</td>
                          <td className="px-3 py-1.5">{r.email || '—'}</td>
                          <td className="px-3 py-1.5">{r.company || '—'}</td>
                          <td className="px-3 py-1.5">
                            {r.errors.length === 0 ? (
                              <Badge tone="success" icon={CheckCircle2}>
                                Ready
                              </Badge>
                            ) : (
                              <Badge tone="danger" icon={AlertTriangle} className="whitespace-normal">
                                {r.errors.join('; ')}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.rows.length > 200 && <p className="text-xs text-muted">Showing the first 200 of {result.rows.length} rows.</p>}
                <div>
                  <Button variant="primary" disabled={valid.length === 0 || importing} onClick={() => void runImport()}>
                    {importing ? 'Importing…' : `Import ${valid.length} valid contact${valid.length === 1 ? '' : 's'}`}
                  </Button>
                  {valid.length === 0 && <p className="mt-1 text-xs text-muted">Fix the errors above to enable the import.</p>}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
