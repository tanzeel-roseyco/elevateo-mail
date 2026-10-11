'use client'

import { useState, useTransition, useEffect, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Card,
  CardContent,
  CardTitle,
  CardDescription,
} from '@workspace/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@workspace/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  IconUpload,
  IconUsers,
  IconFolderOpen,
  IconFolders,
  IconDots,
  IconTrash,
  IconLoader,
  IconCheck,
  IconX,
  IconUserPlus,
  IconSearch,
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react'
import { parseCSV, detectMapping, mapCSVRows, LEAD_FIELDS } from '@workspace/core/csv'
import type { ColumnMapping } from '@workspace/core/csv'
import { createList, deleteList, importLeads, deleteLead, createLead } from './actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ListWithCount = {
  id: number
  name: string
  leadCount: number
  createdAt: string
}

export type LeadRow = {
  id: number
  listId: number
  firstName: string
  lastName: string
  email: string
  company: string
  status: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEAD_FIELD_LABELS: Record<(typeof LEAD_FIELDS)[number], string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email (required)',
  company: 'Company',
  openingLine: 'Opening line',
}

function statusBadge(status: string) {
  if (status === 'new') return <Badge variant="secondary">New</Badge>
  if (status === 'contacted')
    return <Badge className="bg-blue-500/15 text-blue-400 hover:bg-blue-500/15">Contacted</Badge>
  if (status === 'replied')
    return <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15">Replied</Badge>
  if (status === 'bounced')
    return <Badge className="bg-red-500/15 text-red-400 hover:bg-red-500/15">Bounced</Badge>
  if (status === 'unsubscribed')
    return <Badge className="bg-amber-500/15 text-amber-400 hover:bg-amber-500/15">Unsubscribed</Badge>
  return <Badge variant="secondary">{status}</Badge>
}

// ---------------------------------------------------------------------------
// Lead row actions
// ---------------------------------------------------------------------------

function LeadRowActions({ lead }: { lead: LeadRow }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await deleteLead(lead.id)
      toast.success('Lead removed')
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" disabled={isPending}>
          {isPending ? (
            <IconLoader className="size-4 animate-spin" />
          ) : (
            <IconDots className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
          <IconTrash className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// List table row
// ---------------------------------------------------------------------------

function ListTableRow({
  list,
  onImport,
  onAddLead,
}: {
  list: ListWithCount
  onImport: () => void
  onAddLead: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await deleteList(list.id)
      toast.success(`"${list.name}" deleted`)
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{list.name}</TableCell>
      <TableCell className="text-muted-foreground">
        {list.leadCount} {list.leadCount === 1 ? 'lead' : 'leads'}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {new Date(list.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onAddLead}>
            <IconUserPlus className="size-3.5" />
            Add lead
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onImport}>
            <IconUpload className="size-3.5" />
            Import CSV
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" disabled={isPending}>
                {isPending ? (
                  <IconLoader className="size-4 animate-spin" />
                ) : (
                  <IconDots className="size-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
                <IconTrash className="size-4" />
                Delete list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// New list dialog
// ---------------------------------------------------------------------------

function NewListDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [name, setName] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) setName('')
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await createList(name)
        toast.success('List created')
        onOpenChange(false)
      } catch {
        toast.error('Failed to create list')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New list</DialogTitle>
        </DialogHeader>
        <form id="new-list-form" onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="list-name">List name</Label>
            <Input
              id="list-name"
              placeholder="Q2 Prospects"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
        </form>
        <DialogFooter showCloseButton>
          <Button type="submit" form="new-list-form" disabled={isPending || !name.trim()}>
            {isPending && <IconLoader className="mr-1.5 size-4 animate-spin" />}
            Create list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// New lead dialog
// ---------------------------------------------------------------------------

function NewLeadDialog({
  open,
  onOpenChange,
  lists,
  defaultListId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  lists: ListWithCount[]
  defaultListId?: number
}) {
  const [listId, setListId] = useState('')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [company, setCompany] = useState('')
  const [openingLine, setOpeningLine] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setListId(defaultListId ? String(defaultListId) : lists[0] ? String(lists[0].id) : '')
      setEmail('')
      setFirstName('')
      setLastName('')
      setCompany('')
      setOpeningLine('')
    }
  }, [open, defaultListId, lists])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await createLead({
          listId: Number(listId),
          email,
          firstName,
          lastName,
          company,
          openingLine,
        })
        toast.success('Lead added')
        onOpenChange(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add lead')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
        </DialogHeader>
        <form id="new-lead-form" onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>List</Label>
            <Select value={listId} onValueChange={setListId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a list…" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lead-email">Email (required)</Label>
            <Input
              id="lead-email"
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="lead-first">First name</Label>
              <Input
                id="lead-first"
                placeholder="Jane"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lead-last">Last name</Label>
              <Input
                id="lead-last"
                placeholder="Smith"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lead-company">Company</Label>
            <Input
              id="lead-company"
              placeholder="Acme Corp"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lead-opening">Opening line</Label>
            <Input
              id="lead-opening"
              placeholder="Loved your recent post on…"
              value={openingLine}
              onChange={(e) => setOpeningLine(e.target.value)}
            />
          </div>
        </form>
        <DialogFooter showCloseButton>
          <Button
            type="submit"
            form="new-lead-form"
            disabled={isPending || !email.trim() || !listId}
          >
            {isPending && <IconLoader className="mr-1.5 size-4 animate-spin" />}
            Add lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Import CSV wizard dialog
// ---------------------------------------------------------------------------

type WizardStep = 'upload' | 'map' | 'preview' | 'done'

function ImportWizardDialog({
  open,
  onOpenChange,
  lists,
  defaultListId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  lists: ListWithCount[]
  defaultListId?: number
}) {
  const [step, setStep] = useState<WizardStep>('upload')
  const [listId, setListId] = useState<string>('')
  const [newListName, setNewListName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number } | null>(
    null,
  )
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setStep('upload')
      setListId(defaultListId ? String(defaultListId) : '')
      setNewListName('')
      setHeaders([])
      setRawRows([])
      setMapping({})
      setImportResult(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [open, defaultListId])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { headers: h, rows: r, errors } = parseCSV(text)
      if (errors.length > 0) {
        toast.error(`CSV error: ${errors[0]}`)
        return
      }
      if (h.length === 0) {
        toast.error('No columns detected in CSV')
        return
      }
      setHeaders(h)
      setRawRows(r)
      setMapping(detectMapping(h))
    }
    reader.readAsText(file)
  }

  function handleImport() {
    startTransition(async () => {
      try {
        let targetListId: number
        if (listId === 'new') {
          targetListId = await createList(newListName.trim())
        } else {
          targetListId = Number(listId)
        }
        const allMapped = mapCSVRows(rawRows, mapping)
        const result = await importLeads(targetListId, allMapped)
        setImportResult(result)
        setStep('done')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Import failed')
      }
    })
  }

  const canProceedFromUpload =
    rawRows.length > 0 &&
    (listId === 'new' ? newListName.trim().length > 0 : listId !== '')

  const previewLeads =
    step === 'preview' || step === 'done' ? mapCSVRows(rawRows.slice(0, 5), mapping) : []

  const totalMapped = step === 'preview' ? mapCSVRows(rawRows, mapping).length : 0

  const STEP_LABEL: Record<WizardStep, string> = {
    upload: 'Step 1 of 3 — Upload',
    map: 'Step 2 of 3 — Map columns',
    preview: 'Step 3 of 3 — Preview',
    done: 'Done',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl overflow-y-auto max-h-[90vh]"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <p className="text-muted-foreground text-xs">{STEP_LABEL[step]}</p>
        </DialogHeader>

        {/* Step 1 — Upload */}
        {step === 'upload' && (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Import into list</Label>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a list…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">+ Create new list</SelectItem>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {listId === 'new' && (
              <div className="grid gap-1.5">
                <Label htmlFor="import-list-name">New list name</Label>
                <Input
                  id="import-list-name"
                  placeholder="Q2 Prospects"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="import-file">CSV file</Label>
              <Input
                ref={fileInputRef}
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
              />
              {rawRows.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  {rawRows.length} rows · {headers.length} columns detected
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 2 — Map columns */}
        {step === 'map' && (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-xs">
              Map CSV columns to lead fields. Only <strong>Email</strong> is required.
            </p>
            {LEAD_FIELDS.map((field) => {
              const isMapped = !!mapping[field]
              const isRequired = field === 'email'
              return (
                <div key={field} className="grid grid-cols-[160px_1fr_24px] items-center gap-3">
                  <Label className="text-sm">{LEAD_FIELD_LABELS[field]}</Label>
                  <Select
                    value={mapping[field] ?? '__skip__'}
                    onValueChange={(v) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field]: v === '__skip__' ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip__">— Skip —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isMapped ? (
                    <IconCheck className="size-4 shrink-0 text-emerald-400" />
                  ) : isRequired ? (
                    <IconX className="size-4 shrink-0 text-red-400" />
                  ) : (
                    <IconX className="size-4 shrink-0 text-muted-foreground/30" />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Step 3 — Preview */}
        {step === 'preview' && (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-xs">
              {totalMapped} lead{totalMapped !== 1 ? 's' : ''} ready to import. Showing first{' '}
              {Math.min(5, previewLeads.length)}.
            </p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">First</TableHead>
                    <TableHead className="text-xs">Last</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Company</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewLeads.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-muted-foreground py-6 text-center text-xs"
                      >
                        No valid rows found. Make sure the Email column is mapped.
                      </TableCell>
                    </TableRow>
                  ) : (
                    previewLeads.map((lead, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{lead.firstName || '—'}</TableCell>
                        <TableCell className="text-xs">{lead.lastName || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{lead.email}</TableCell>
                        <TableCell className="text-xs">{lead.company || '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Done */}
        {step === 'done' && importResult && (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/15">
              <IconCheck className="size-6 text-emerald-400" />
            </div>
            <p className="text-base font-medium">Import complete</p>
            <p className="text-muted-foreground text-center text-sm">
              {importResult.inserted} lead{importResult.inserted !== 1 ? 's' : ''} imported
              {importResult.skipped > 0 &&
                `, ${importResult.skipped} duplicate${importResult.skipped !== 1 ? 's' : ''} skipped`}
              .
            </p>
          </div>
        )}

        <DialogFooter>
          {step !== 'upload' && step !== 'done' && (
            <Button
              variant="outline"
              onClick={() => setStep(step === 'map' ? 'upload' : 'map')}
              disabled={isPending}
            >
              Back
            </Button>
          )}
          {step === 'upload' && (
            <Button onClick={() => setStep('map')} disabled={!canProceedFromUpload}>
              Next
            </Button>
          )}
          {step === 'map' && (
            <Button onClick={() => setStep('preview')} disabled={!mapping.email}>
              Next — Preview
            </Button>
          )}
          {step === 'preview' && (
            <Button onClick={handleImport} disabled={isPending || totalMapped === 0}>
              {isPending && <IconLoader className="mr-1.5 size-4 animate-spin" />}
              Import {totalMapped} lead{totalMapped !== 1 ? 's' : ''}
            </Button>
          )}
          {step === 'done' && <Button onClick={() => onOpenChange(false)}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Manage lists dialog
// ---------------------------------------------------------------------------

function ManageListsDialog({
  open,
  onOpenChange,
  lists,
  onImport,
  onAddLead,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  lists: ListWithCount[]
  onImport: (listId: number) => void
  onAddLead: (listId: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage lists</DialogTitle>
        </DialogHeader>
        {lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="bg-primary/10 mb-4 flex size-14 items-center justify-center rounded-full">
              <IconUsers className="text-primary size-7" />
            </div>
            <CardTitle className="mb-1 text-base">No lists yet</CardTitle>
            <CardDescription className="max-w-xs text-center text-sm">
              Create a list to start organizing your contacts.
            </CardDescription>
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>List name</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lists.map((list) => (
                  <ListTableRow
                    key={list.id}
                    list={list}
                    onAddLead={() => onAddLead(list.id)}
                    onImport={() => onImport(list.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

type SortKey = 'name' | 'email' | 'company' | 'list' | 'status'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function SortableHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
}) {
  const isActive = activeKey === sortKey
  return (
    <TableHead>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(sortKey)}
      >
        {label}
        {isActive ? (
          dir === 'asc' ? (
            <IconArrowUp className="size-3.5" />
          ) : (
            <IconArrowDown className="size-3.5" />
          )
        ) : (
          <IconArrowsSort className="size-3.5 text-muted-foreground/50" />
        )}
      </button>
    </TableHead>
  )
}

export function LeadsView({
  lists,
  leads,
}: {
  lists: ListWithCount[]
  leads: LeadRow[]
}) {
  const [addListOpen, setAddListOpen] = useState(false)
  const [manageListsOpen, setManageListsOpen] = useState(false)
  const [addLeadOpen, setAddLeadOpen] = useState(false)
  const [addLeadDefaultListId, setAddLeadDefaultListId] = useState<number | undefined>(undefined)
  const [importOpen, setImportOpen] = useState(false)
  const [importDefaultListId, setImportDefaultListId] = useState<number | undefined>(undefined)

  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const listNameMap = useMemo(() => new Map(lists.map((l) => [l.id, l.name])), [lists])

  function openAddLead(listId?: number) {
    setAddLeadDefaultListId(listId)
    setAddLeadOpen(true)
  }

  function openImport(listId?: number) {
    setImportDefaultListId(listId)
    setImportOpen(true)
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((lead) => {
      if (listFilter !== 'all' && String(lead.listId) !== listFilter) return false
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false
      if (q) {
        const haystack = [lead.firstName, lead.lastName, lead.email, lead.company]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [leads, search, listFilter, statusFilter])

  const sortedLeads = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filteredLeads].sort((a, b) => {
      let av = ''
      let bv = ''
      switch (sortKey) {
        case 'name':
          av = `${a.firstName} ${a.lastName}`.trim().toLowerCase()
          bv = `${b.firstName} ${b.lastName}`.trim().toLowerCase()
          break
        case 'email':
          av = a.email.toLowerCase()
          bv = b.email.toLowerCase()
          break
        case 'company':
          av = a.company.toLowerCase()
          bv = b.company.toLowerCase()
          break
        case 'list':
          av = (listNameMap.get(a.listId) ?? '').toLowerCase()
          bv = (listNameMap.get(b.listId) ?? '').toLowerCase()
          break
        case 'status':
          av = a.status.toLowerCase()
          bv = b.status.toLowerCase()
          break
      }
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
    })
  }, [filteredLeads, sortKey, sortDir, listNameMap])

  const totalPages = Math.max(1, Math.ceil(sortedLeads.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedLeads = sortedLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function updateListFilter(value: string) {
    setListFilter(value)
    setPage(1)
  }

  function updateStatusFilter(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  function updatePageSize(value: string) {
    setPageSize(Number(value))
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your lead lists and contacts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setManageListsOpen(true)}>
            <IconFolders className="size-4" />
            Manage lists
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setAddListOpen(true)}>
            <IconFolderOpen className="size-4" />
            New list
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => openAddLead()}
            disabled={lists.length === 0}
          >
            <IconUserPlus className="size-4" />
            Add lead
          </Button>
          <Button className="gap-2" onClick={() => openImport()}>
            <IconUpload className="size-4" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <IconSearch className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Search by name, email, or company..."
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
          />
        </div>
        <Select value={listFilter} onValueChange={updateListFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="List" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lists</SelectItem>
            {lists.map((l) => (
              <SelectItem key={l.id} value={String(l.id)}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={updateStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
            <SelectItem value="bounced">Bounced</SelectItem>
            <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground ml-auto text-sm">
          {sortedLeads.length} {sortedLeads.length === 1 ? 'lead' : 'leads'}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Name"
                  sortKey="name"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Email"
                  sortKey="email"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Company"
                  sortKey="company"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="List"
                  sortKey="list"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Status"
                  sortKey="status"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedLeads.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground py-12 text-center text-sm"
                  >
                    {leads.length === 0
                      ? 'No leads yet. Import a CSV to get started.'
                      : 'No leads match your filters.'}
                  </TableCell>
                </TableRow>
              ) : (
                pagedLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {lead.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {lead.company || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {listNameMap.get(lead.listId) ?? '—'}
                    </TableCell>
                    <TableCell>{statusBadge(lead.status)}</TableCell>
                    <TableCell>
                      <LeadRowActions lead={lead} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <Select value={String(pageSize)} onValueChange={updatePageSize}>
            <SelectTrigger className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <IconChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <IconChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <ManageListsDialog
        open={manageListsOpen}
        onOpenChange={setManageListsOpen}
        lists={lists}
        onAddLead={(id) => {
          setManageListsOpen(false)
          openAddLead(id)
        }}
        onImport={(id) => {
          setManageListsOpen(false)
          openImport(id)
        }}
      />
      <NewListDialog open={addListOpen} onOpenChange={setAddListOpen} />
      <NewLeadDialog
        open={addLeadOpen}
        onOpenChange={setAddLeadOpen}
        lists={lists}
        defaultListId={addLeadDefaultListId}
      />
      <ImportWizardDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        lists={lists}
        defaultListId={importDefaultListId}
      />
    </div>
  )
}
