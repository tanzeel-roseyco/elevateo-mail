import { Check, ImagePlus, Inbox, Pencil, Send, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { applyAppearance, useMediaQuery, usePrefs } from '@/app/appearance'
import { ACCENT_PRESETS, BACKGROUND_PRESETS, BLUR_MAX, CHROME_OPACITY_MIN, DEFAULT_APPEARANCE, MAX_BACKGROUND_IMAGE_BYTES, type Appearance } from '@/domain/appearance'
import { cx } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Segmented } from '@/ui/Field'
import { toast } from '@/ui/toast'

/** Miniature of the workspace, themed by the unsaved draft so changes can be judged before saving. */
function Preview({ draft }: { draft: Appearance }) {
  const ref = useRef<HTMLDivElement>(null)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  useEffect(() => {
    if (ref.current) applyAppearance(ref.current, draft, systemDark)
  }, [draft, systemDark])

  const rows = [
    { from: 'Priya Raman', subject: 'Revised scope and timeline', unread: true },
    { from: 'Dana Okafor', subject: 'Speaking slot in March?', unread: true },
    { from: 'Tomasz Wieczorek', subject: 'Data-sharing agreement', unread: false },
  ]
  return (
    <div ref={ref} aria-label="Live preview" role="img" className="relative isolate flex h-56 overflow-hidden rounded-xl border border-line text-[11px] text-fg" style={{ backgroundColor: 'var(--bg)' }}>
      {draft.bgImage && <div className="absolute inset-0 -z-10 scale-105 bg-cover bg-center" style={{ backgroundImage: `url("${draft.bgImage}")`, filter: 'blur(var(--bg-blur))' }} />}
      <div className="chrome flex w-32 shrink-0 flex-col gap-1 p-2">
        <span className="mb-1 flex h-7 items-center gap-1.5 rounded-lg bg-accent px-2 font-semibold text-accent-fg">
          <Pencil className="size-3" /> Compose
        </span>
        <span className="flex h-6 items-center gap-1.5 rounded-full bg-accent-soft px-2 font-semibold text-accent-text">
          <Inbox className="size-3" /> Inbox
        </span>
        <span className="flex h-6 items-center gap-1.5 rounded-full px-2">
          <Send className="size-3" /> Sent
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-2 pl-0">
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-surface">
          {rows.map((r) => (
            <div key={r.from} className={cx('row flex items-center gap-2 border-b border-line px-2', r.unread ? 'font-semibold' : 'bg-surface-2/60')}>
              {r.unread && <span className="size-1.5 rounded-full bg-accent" />}
              <span className="w-24 shrink-0 truncate">{r.from}</span>
              <span className="truncate font-normal text-muted">{r.subject}</span>
            </div>
          ))}
          <p className="px-2 pt-2 text-accent-text underline">A link in your accent colour</p>
        </div>
      </div>
    </div>
  )
}

const swatch = 'relative flex size-8 items-center justify-center rounded-full border border-line'

const BACKGROUND_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function AppearanceSettings() {
  const saved = usePrefs((s) => s.prefs)
  const save = usePrefs((s) => s.save)
  const persisted = usePrefs((s) => s.persisted)
  const [draft, setDraft] = useState(saved)
  const fileRef = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const patch = (p: Partial<Appearance>) => setDraft((d) => ({ ...d, ...p }))
  // Identifies the newest image choice, so a slow earlier file read cannot overwrite a later pick or removal.
  const imageChoice = useRef(0)
  const replaceDraft = (next: Appearance) => {
    imageChoice.current++
    setDraft(next)
  }

  const pickImage = (file: File | undefined) => {
    if (!file) return
    if (!BACKGROUND_IMAGE_TYPES.includes(file.type)) return toast('Choose an image file (PNG, JPEG, or WebP).', { tone: 'error' })
    if (file.size > MAX_BACKGROUND_IMAGE_BYTES) return toast('That image is larger than 1.5 MB. Choose a smaller one.', { tone: 'error' })
    const choice = ++imageChoice.current
    const reader = new FileReader()
    reader.onload = () => choice === imageChoice.current && typeof reader.result === 'string' && patch({ bgImage: reader.result })
    reader.onerror = () => choice === imageChoice.current && toast('The image could not be read.', { tone: 'error' })
    reader.readAsDataURL(file)
  }

  const onSave = () => {
    if (save(draft)) toast('Appearance saved.', { tone: 'success' })
    else toast('Applied for this session, but the browser could not store it (storage is full or blocked).', { tone: 'error' })
  }

  return (
    <form
      className="mt-4 flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <Preview draft={draft} />

      <Segmented legend="Theme" value={draft.theme} onChange={(theme) => patch({ theme })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">Accent colour</legend>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((p) => (
            <button key={p.value} type="button" aria-label={`${p.name} accent`} aria-pressed={draft.accent === p.value} title={p.name} onClick={() => patch({ accent: p.value })} className={swatch} style={{ backgroundColor: p.value }}>
              {draft.accent === p.value && <Check aria-hidden className="size-4 text-white" />}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-[13px]">
            Custom
            <input type="color" value={draft.accent} onChange={(e) => patch({ accent: e.target.value })} className="h-8 w-10 rounded border border-line bg-surface" />
          </label>
        </div>
        <p className="mt-1.5 text-xs text-muted">Text and link shades are adjusted automatically so any accent stays readable.</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">Background</legend>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={draft.bgColor === null} onClick={() => patch({ bgColor: null })} className={cx('h-8 rounded-full border px-3 text-[13px]', draft.bgColor === null ? 'border-accent-text bg-accent-soft font-semibold text-accent-text' : 'border-line')}>
            Theme default
          </button>
          {BACKGROUND_PRESETS.map((p) => (
            <button key={p.value} type="button" aria-label={`${p.name} background`} aria-pressed={draft.bgColor === p.value} title={p.name} onClick={() => patch({ bgColor: p.value })} className={swatch} style={{ backgroundColor: p.value }}>
              {draft.bgColor === p.value && <Check aria-hidden className="size-4 text-white mix-blend-difference" />}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-[13px]">
            Custom
            <input type="color" value={draft.bgColor ?? '#f3f5f8'} onChange={(e) => patch({ bgColor: e.target.value })} className="h-8 w-10 rounded border border-line bg-surface" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button icon={<ImagePlus aria-hidden className="size-4" />} onClick={() => fileRef.current?.click()}>
            {draft.bgImage ? 'Replace background image' : 'Add background image'}
          </Button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = '' }} />
          {draft.bgImage && (
            <Button variant="ghost" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => replaceDraft({ ...draft, bgImage: null })}>
              Remove image
            </Button>
          )}
          <span className="text-xs text-muted">Optional. Max 1.5 MB; stays in this browser.</span>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            Background blur: {draft.blur}px
            <input type="range" min={0} max={BLUR_MAX} step={1} value={draft.blur} disabled={!draft.bgImage} onChange={(e) => patch({ blur: Number(e.target.value) })} className="accent-[var(--accent)]" />
            {!draft.bgImage && <span className="text-xs font-normal text-muted">Add a background image to use blur.</span>}
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            Panel overlay strength: {draft.chromeOpacity}%
            <input type="range" min={CHROME_OPACITY_MIN} max={100} step={1} value={draft.chromeOpacity} onChange={(e) => patch({ chromeOpacity: Number(e.target.value) })} className="accent-[var(--accent)]" />
            <span className="text-xs font-normal text-muted">Limited to {CHROME_OPACITY_MIN}% or more so sidebar text stays readable.</span>
          </label>
        </div>
      </fieldset>

      <Segmented legend="Density" value={draft.density} onChange={(density) => patch({ density })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
      <Segmented legend="Default inbox layout" value={draft.inboxLayout} onChange={(inboxLayout) => patch({ inboxLayout })} options={[{ value: 'list', label: 'List' }, { value: 'split', label: 'Split pane' }]} />

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-3 md:-mx-6 md:px-6">
        <Button type="submit" variant="primary" disabled={!dirty}>
          Save appearance
        </Button>
        <Button disabled={!dirty} onClick={() => replaceDraft(saved)}>
          Cancel
        </Button>
        <Button variant="ghost" onClick={() => replaceDraft(DEFAULT_APPEARANCE)}>
          Reset to defaults
        </Button>
        <span aria-live="polite" className="text-xs text-muted">
          {dirty ? 'Unsaved changes — preview only until you save.' : persisted ? 'Saved in this browser.' : 'Applied for this session only: the browser could not store it.'}
        </span>
      </div>
    </form>
  )
}
