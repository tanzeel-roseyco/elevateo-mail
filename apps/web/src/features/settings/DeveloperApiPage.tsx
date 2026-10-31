// Settings › Developer API (EmailGuard "api-settings"): two link cards (reference, Postman download),
// the white-label contact card, the
// API Tokens section with the "Add New API Token" modal (Token Name, Token Type api-user |
// super-admin, the recommendation callout, Generate Token) and the "No token yet." empty state.
// Tokens have no issuing endpoint in this build. Production shows an unavailable state for the
// token section (the reference and Postman cards are real); demo/dev-fixture entries generate the
// secret locally, show it once and keep only name, type, prefix and creation time in the simulated
// adapter store.
import { useId, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { EmptyState } from '@/ui/Async'
import { Badge } from '@/ui/Badge'
import { Link } from 'react-router'
import { cx, formatDateTime } from '@/lib/format'
import { Button, buttonClass } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Card, LinkCard, LinkCardGrid } from '@/ui/Card'
import { CodeBlock } from '@/ui/CodeBlock'
import { Field, Select, TextInput } from '@/ui/Field'
import { Modal } from '@/ui/Modal'
import { SectionHeader } from '@/ui/PageHeader'
import { KeyIcon, PlusIcon } from '@/ui/icons'
import { useToast } from '@/ui/Toast'
import { SimulatedAdapterNotice } from './SettingsLayout'
import { simulatedId, useSimulatedStore } from './simulatedStore'
import { UnavailableSetting, useSimulatedSettings } from './UnavailableSetting'

const TokenSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  type: z.enum(['api-user', 'super-admin']),
  prefix: z.string().min(1).max(16),
  created_at: z.string(),
})
type Token = z.infer<typeof TokenSchema>
/** Hard limit of the adapter; a full list refuses new tokens instead of evicting old ones. */
export const TOKEN_LIMIT = 50
const TokensSchema = z.array(TokenSchema).max(TOKEN_LIMIT)
const NO_TOKENS: readonly Token[] = []

/** 32 random bytes, base64url: never stored, shown to the user exactly once. */
function generateSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function DeveloperApiPage() {
  const simulated = useSimulatedSettings()
  return (
    <>
      <LinkCardGrid className="mb-8">
        <LinkCard to="/help/articles/developer-api-overview" title="Full API Reference" text="Read the endpoints, envelopes and error codes the Elevateo gateway exposes" />
        {/* Generated from contracts/v1+v2 by lib/postmanCollection.ts; the Docker test keeps it in sync. */}
        <LinkCard to="/developer/elevateo-mail.postman_collection.json" download title="Postman Collection" text="Download the v2.1 collection for every v1 and v2 endpoint; fill baseUrl and the session variables" />
      </LinkCardGrid>

      <Card className="mb-8 max-w-3xl">
        <h2 className="text-sm font-medium text-fg ">White-label Elevateo Mail</h2>
        <p className="mt-1 text-sm text-muted ">Run the mailroom under your own brand and domain for your clients. Each organization is a separate tenant with its own members, mailboxes and simulated-mail boundary.</p>
        <Link to="/help/community" className={cx(buttonClass('outline', 'xs'), 'mt-4')}>Contact us about white-label</Link>
      </Card>

      {simulated ? (
        <SimulatedTokensSection />
      ) : (
        <>
          <SectionHeader title="API Tokens" subtitle="Manage all your API tokens for this workspace" />
          <UnavailableSetting
            icon={<KeyIcon className="size-5" />}
            title="API tokens are not available yet"
            body="The gateway authenticates with the signed-in session only; there is no endpoint that issues or revokes tokens in this release. The API reference above describes every current endpoint."
            action={{ to: '/help/articles/developer-api-overview', label: 'Full API Reference' }}
          />
        </>
      )}
    </>
  )
}

function SimulatedTokensSection() {
  const store = useSimulatedStore<readonly Token[]>('api-tokens', TokensSchema, NO_TOKENS)
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState<{ name: string; secret: string } | null>(null)
  const { toast } = useToast()
  /** Returns an error message when the token cannot be created; the modal shows it inline. */
  const create = (name: string, type: Token['type']): string | null => {
    const secret = `elv_${type === 'super-admin' ? 'sa' : 'au'}_${generateSecret()}`
    let error: string | null = null
    store.update((current) => {
      if (current.length >= TOKEN_LIMIT) {
        error = `This workspace already has ${TOKEN_LIMIT} tokens. Revoke one before generating another.`
        return null
      }
      return [...current, { id: simulatedId(), name, type, prefix: secret.slice(0, 12), created_at: new Date().toISOString() }]
    })
    if (error !== null) return error
    setOpen(false)
    setRevealed({ name, secret })
    return null
  }
  const revoke = (token: Token) => {
    store.update((current) => current.filter((t) => t.id !== token.id))
    toast(`Token “${token.name}” revoked.`, 'neutral')
  }
  return (
    <>
      <SectionHeader
        title="API Tokens"
        subtitle="Manage all your API tokens for this workspace"
        action={<Button variant="primary" size="xs" icon={<PlusIcon className="size-4" />} onClick={() => setOpen(true)} disabled={!store.writable}>Add New API Token</Button>}
      />
      <SimulatedAdapterNotice>Tokens generated here are not accepted by the server. The gateway authenticates with the signed-in session only; this page shows the intended token workflow.</SimulatedAdapterNotice>
      <div className="max-w-3xl">
        {store.value.length === 0 ? (
          <EmptyState icon={<KeyIcon className="size-5" />} title="No token yet." body="There is no current token here." action={<Button variant="primary" onClick={() => setOpen(true)} disabled={!store.writable}>Add New API Token</Button>} />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line " aria-label="API tokens">
              {store.value.map((token) => (
                <li key={token.id} className="flex flex-wrap items-center gap-3 px-6 py-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg ">{token.name}</p>
                    <p className="text-xs text-muted"><span className="font-mono">{token.prefix}…</span> · created {formatDateTime(token.created_at)}</p>
                  </div>
                  <Badge tone={token.type === 'super-admin' ? 'warn' : 'neutral'} size="sm">{token.type}</Badge>
                  <Button size="sm" variant="danger" onClick={() => revoke(token)}>Revoke</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <TokenModal open={open} onOpenChange={setOpen} onCreate={create} />
      <Modal
        open={revealed !== null}
        onOpenChange={(next) => {
          if (!next) setRevealed(null)
        }}
        title="Copy your new token"
        description="This is the only time the full token is shown."
        footer={<Button variant="primary" onClick={() => setRevealed(null)}>Done</Button>}
      >
        {revealed && (
          <div className="space-y-4">
            <p className="text-sm text-fg ">Token “{revealed.name}”. Store it in a secret manager; only its prefix is kept here.</p>
            <CodeBlock code={revealed.secret} />
            <Callout variant="warning">Simulated token: the server will not accept it.</Callout>
          </div>
        )}
      </Modal>
    </>
  )
}

function TokenModal({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange(open: boolean): void; onCreate(name: string, type: Token['type']): string | null }) {
  const id = useId()
  const [name, setName] = useState('')
  const [type, setType] = useState<Token['type']>('api-user')
  const [error, setError] = useState<string | null>(null)
  // Every way out of the modal (Cancel, close button, Escape, success) clears the draft.
  const close = () => {
    setName('')
    setType('api-user')
    setError(null)
    onOpenChange(false)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '' || trimmed.length > 80) return setError('Enter a token name of 1 to 80 characters.')
    const refused = onCreate(trimmed, type)
    if (refused !== null) return setError(refused)
    close()
  }
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      title="New API Token"
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" type="submit" form={`${id}-form`}>Generate Token</Button>
        </>
      }
    >
      <form id={`${id}-form`} className="space-y-4" onSubmit={submit} noValidate>
        <Field id={`${id}-name`} label="Token Name" error={error}>
          <TextInput id={`${id}-name`} placeholder="My API token" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} aria-invalid={error ? true : undefined} />
        </Field>
        <Field id={`${id}-type`} label="Token Type">
          <Select id={`${id}-type`} value={type} onChange={(event) => setType(event.target.value === 'super-admin' ? 'super-admin' : 'api-user')}>
            <option value="api-user">api-user</option>
            <option value="super-admin">super-admin</option>
          </Select>
        </Field>
        <Callout variant="accent">
          <p className="font-medium">We recommend the api-user type for almost every integration.</p>
          <p className="mt-1">It scopes every permission to the current workspace, which keeps multi-client setups and no-code platforms isolated from each other.</p>
        </Callout>
      </form>
    </Modal>
  )
}
