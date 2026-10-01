import type { Contact } from './schema'
import { EMAIL_PATTERN } from './rules'

// AIDEV-NOTE: Contact CSV import parsing + validation. Pure so the preview and the import share one verdict.

/**
 * RFC 4180-style parser: quoted fields, escaped quotes (""), and CRLF or LF line endings.
 * A quote only opens a quoted field at the start of that field; anywhere else it is kept as a literal
 * character, so malformed input is never silently rewritten into different data.
 */
export function parseCsv(source: string): string[][] {
  // Spreadsheet exports often start with a UTF-8 byte-order mark, which would corrupt the first header.
  const text = source.startsWith('\uFEFF') ? source.slice(1) : source
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Blank lines carry no data and should not surface as validation errors.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

export const IMPORT_COLUMNS = ['name', 'email', 'company', 'tags', 'consent'] as const
export const MAX_IMPORT_ROWS = 2000

export interface ImportRow {
  line: number
  name: string
  email: string
  company: string
  tags: string[]
  consent: Contact['consent']
  errors: string[]
}

export type ImportResult = { ok: true; rows: ImportRow[] } | { ok: false; error: string }

const CONSENT_YES = new Set(['yes', 'true', 'opted_in', 'opted-in', 'y'])

export function validateImport(text: string, existingEmails: ReadonlySet<string>): ImportResult {
  const [header, ...body] = parseCsv(text)
  if (!header) return { ok: false, error: 'The file is empty.' }
  const columns = header.map((h) => h.trim().toLowerCase())
  const missing = IMPORT_COLUMNS.filter((c) => !columns.includes(c))
  if (missing.length > 0) return { ok: false, error: `Missing required column(s): ${missing.join(', ')}.` }
  if (body.length === 0) return { ok: false, error: 'The file has a header but no contact rows.' }
  if (body.length > MAX_IMPORT_ROWS) return { ok: false, error: `Too many rows (${body.length}). The limit is ${MAX_IMPORT_ROWS}.` }

  const cell = (row: string[], name: string) => (row[columns.indexOf(name)] ?? '').trim()
  const seen = new Set<string>()
  const rows = body.map((row, index): ImportRow => {
    const email = cell(row, 'email').toLowerCase()
    const name = cell(row, 'name')
    const consentRaw = cell(row, 'consent').toLowerCase()
    const errors: string[] = []
    if (!name) errors.push('Name is missing')
    if (!email) errors.push('Email is missing')
    else if (!EMAIL_PATTERN.test(email)) errors.push('Email is not valid')
    else if (existingEmails.has(email)) errors.push('Already in contacts')
    else if (seen.has(email)) errors.push('Duplicate within this file')
    // Outreach is opt-in only: a row without recorded consent is rejected rather than imported as unknown.
    if (!CONSENT_YES.has(consentRaw)) errors.push('No opt-in consent recorded')
    seen.add(email)
    return {
      line: index + 2,
      name,
      email,
      company: cell(row, 'company'),
      tags: cell(row, 'tags').split(/[;|]/).map((t) => t.trim()).filter(Boolean),
      consent: 'opted_in',
      errors,
    }
  })
  return { ok: true, rows }
}
