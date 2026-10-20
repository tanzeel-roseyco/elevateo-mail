// Settings › Tags (EmailGuard "Custom Tags"): list of workspace tags and the "Add New Tag" modal
// with the 20-swatch colour grid (`grid grid-cols-10 gap-2`, `w-8 h-8 rounded-full`). Tags have
// no backend in this build and live in the simulated adapter store.
import { useId, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { EmptyState } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Field, TextInput } from '@/ui/Field'
import { Modal } from '@/ui/Modal'
import { PlusIcon, TagIcon } from '@/ui/icons'
import { cx } from '@/lib/format'
import { useToast } from '@/ui/Toast'
import { SimulatedAdapterNotice } from './SettingsLayout'
import { simulatedId, useSimulatedStore } from './simulatedStore'

/** The reference palette: two rows of ten, light tints first, then saturated hues. */
export const TAG_COLOURS: readonly { name: string; hex: string }[] = [
  { name: 'Rose', hex: '#fecdd3' }, { name: 'Peach', hex: '#fed7aa' }, { name: 'Lemon', hex: '#fef08a' }, { name: 'Lime', hex: '#d9f99d' }, { name: 'Mint', hex: '#bbf7d0' },
  { name: 'Aqua', hex: '#a5f3fc' }, { name: 'Sky', hex: '#bae6fd' }, { name: 'Lavender', hex: '#ddd6fe' }, { name: 'Pink', hex: '#fbcfe8' }, { name: 'Stone', hex: '#e7e5e4' },
  { name: 'Red', hex: '#ef4444' }, { name: 'Orange', hex: '#f97316' }, { name: 'Gold', hex: '#c9a24e' }, { name: 'Green', hex: '#22c55e' }, { name: 'Teal', hex: '#14b8a6' },
  { name: 'Cyan', hex: '#06b6d4' }, { name: 'Indigo', hex: '#6366f1' }, { name: 'Violet', hex: '#8b5cf6' }, { name: 'Magenta', hex: '#d946ef' }, { name: 'Slate', hex: '#64748b' },
]

const TagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/),
})
export type Tag = z.infer<typeof TagSchema>
/** Hard limit of the adapter; a full list refuses new tags instead of evicting old ones. */
export const TAG_LIMIT = 200
const TagsSchema = z.array(TagSchema).max(TAG_LIMIT)
const NO_TAGS: readonly Tag[] = []

export function TagsPage() {
  const store = useSimulatedStore<readonly Tag[]>('tags', TagsSchema, NO_TAGS)
  const [open, setOpen] = useState(false)
  const { toast } = useToast()
  const remove = (tag: Tag) => {
    store.update((current) => current.filter((t) => t.id !== tag.id))
    toast(`Tag “${tag.name}” removed.`, 'neutral')
  }
  /** Returns an error message when the tag cannot be added; the modal shows it inline. */
  const add = (tag: Omit<Tag, 'id'>): string | null => {
    let error: string | null = null
    store.update((current) => {
      if (current.length >= TAG_LIMIT) {
        error = `This workspace already has ${TAG_LIMIT} tags. Delete one before adding another.`
        return null
      }
      if (current.some((t) => t.name.toLowerCase() === tag.name.toLowerCase())) {
        error = 'A tag with that name already exists.'
        return null
      }
      return [...current, { ...tag, id: simulatedId() }]
    })
    if (error !== null) return error
    setOpen(false)
    toast(`Tag “${tag.name}” created in this browser only.`, 'neutral')
    return null
  }
  return (
    <>
      <SimulatedAdapterNotice />
      <div className="max-w-3xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-base font-medium text-zinc-800 dark:text-white">Tags</h2>
          <Button variant="primary" size="xs" icon={<PlusIcon className="size-4" />} onClick={() => setOpen(true)} disabled={!store.writable}>Add New Tag</Button>
        </div>
        {store.value.length === 0 ? (
          <EmptyState icon={<TagIcon className="size-5" />} title="No tags yet" body="Tags label conversations and campaigns for your team. Create your first tag to start organising." action={<Button variant="primary" onClick={() => setOpen(true)} disabled={!store.writable}>Add New Tag</Button>} />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-700" aria-label="Tags">
              {store.value.map((tag) => (
                <li key={tag.id} className="flex items-center gap-3 px-6 py-3 text-sm">
                  <Badge color={tag.color}>{tag.name}</Badge>
                  <span className="ms-auto flex items-center gap-2">
                    <span className="font-mono text-xs text-zinc-500">{tag.color}</span>
                    <Button size="sm" variant="danger" onClick={() => remove(tag)}>Delete</Button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <TagModal open={open} onOpenChange={setOpen} onCreate={add} />
    </>
  )
}

function TagModal({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange(open: boolean): void; onCreate(tag: Omit<Tag, 'id'>): string | null }) {
  const id = useId()
  const [name, setName] = useState('')
  const [color, setColor] = useState(TAG_COLOURS[0]!.hex)
  const [error, setError] = useState<string | null>(null)
  // Every way out of the modal (Cancel, close button, Escape, success) clears the draft.
  const close = () => {
    setName('')
    setColor(TAG_COLOURS[0]!.hex)
    setError(null)
    onOpenChange(false)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '' || trimmed.length > 40) return setError('Enter a tag name of 1 to 40 characters.')
    const refused = onCreate({ name: trimmed, color })
    if (refused !== null) return setError(refused)
    close()
  }
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      title="Add New Tag"
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" type="submit" form={`${id}-form`}>Create Tag</Button>
        </>
      }
    >
      <form id={`${id}-form`} className="space-y-6" onSubmit={submit} noValidate>
        <Field id={`${id}-name`} label="Tag Name" error={error}>
          <TextInput id={`${id}-name`} placeholder="Enter tag name..." value={name} maxLength={40} onChange={(event) => setName(event.target.value)} aria-invalid={error ? true : undefined} />
        </Field>
        <fieldset>
          <legend className="text-sm font-medium text-zinc-800 dark:text-white">Color</legend>
          {/* Ten columns match the reference at ≥640px; five keep 32px swatches inside a 390px modal. */}
          <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10" role="radiogroup" aria-label="Tag colour">
            {TAG_COLOURS.map((swatch) => {
              const selected = swatch.hex === color
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={swatch.name}
                  onClick={() => setColor(swatch.hex)}
                  style={{ backgroundColor: swatch.hex }}
                  className={cx('h-8 w-8 rounded-full transition-transform duration-75 hover:scale-105', selected && 'ring-2 ring-zinc-500 ring-offset-2 dark:ring-offset-zinc-800')}
                />
              )
            })}
          </div>
        </fieldset>
        <div className="flex items-center gap-2 text-sm text-zinc-500">Preview: <Badge color={color}>{name.trim() === '' ? 'Tag name' : name.trim()}</Badge></div>
      </form>
    </Modal>
  )
}
