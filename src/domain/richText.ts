// AIDEV-NOTE: Tiny markdown subset → structured nodes. Bodies are never rendered as HTML (STANDARDS §8).

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'link'; text: string; href: string }

export type Block = { kind: 'paragraph'; lines: Inline[][] } | { kind: 'list'; items: Inline[][] }

const ITALIC = '(?<![A-Za-z0-9])_([^_\\n]+)_(?![A-Za-z0-9])'
// **bold**, _italic_, [label](url). Alternation order matters: links first so their label is not re-parsed.
const INLINE = new RegExp(`\\[([^\\]\\n]+)\\]\\(([^)\\s]+)\\)|\\*\\*([^*\\n]+)\\*\\*|${ITALIC}`, 'g')

/** Only web and mail links are clickable; anything else (e.g. javascript:) stays plain text. */
export function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href)
}

export function parseInline(line: string): Inline[] {
  const out: Inline[] = []
  let cursor = 0
  for (const m of line.matchAll(INLINE)) {
    if (m.index > cursor) out.push({ kind: 'text', text: line.slice(cursor, m.index) })
    const [whole, label, href, bold, italic] = m
    if (label !== undefined && href !== undefined) {
      out.push(isSafeHref(href) ? { kind: 'link', text: label, href } : { kind: 'text', text: whole })
    } else if (bold !== undefined) out.push({ kind: 'bold', text: bold })
    else if (italic !== undefined) out.push({ kind: 'italic', text: italic })
    cursor = m.index + whole.length
  }
  if (cursor < line.length) out.push({ kind: 'text', text: line.slice(cursor) })
  return out
}

export function parseRichText(source: string): Block[] {
  const blocks: Block[] = []
  for (const chunk of source.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((l) => l.trim() !== '')
    if (lines.length === 0) continue
    if (lines.every((l) => l.startsWith('- '))) {
      blocks.push({ kind: 'list', items: lines.map((l) => parseInline(l.slice(2))) })
    } else {
      blocks.push({ kind: 'paragraph', lines: lines.map(parseInline) })
    }
  }
  return blocks
}

/** One-line plain preview for message rows. */
export function plainPreview(source: string, max = 140): string {
  const plain = source
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(new RegExp(ITALIC, 'g'), '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? plain.slice(0, max - 1) + '…' : plain
}
