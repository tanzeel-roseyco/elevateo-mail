// Settings › Integrations: the hub of link cards and the integration detail pages (numbered
// steps with copyable code blocks, DESIGN-SPEC §6.5). The MCP server and CLI connector are the
// two adapters planned in .planning/CLIENTS_AND_CLI_CONNECTORS.md; neither is shipped in this
// build, and each page says so instead of pretending a connection exists.
import { Link, useParams } from 'react-router'
import { EmptyState } from '@/ui/Async'
import { buttonClass } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Card, LinkCard, LinkCardGrid } from '@/ui/Card'
import { CodeBlock } from '@/ui/CodeBlock'
import { PuzzlePieceIcon } from '@/ui/icons'

interface Step {
  title: string
  text: string
  code?: string
  language?: string
}

interface Integration {
  slug: string
  title: string
  text: string
  intro: string
  steps: readonly Step[]
}

export const INTEGRATIONS: readonly Integration[] = [
  {
    slug: 'mcp',
    title: 'Connections',
    text: 'Grant AI clients (Claude, Codex) access to your mailboxes, and revoke it',
    intro: 'The planned connection workflow gives an MCP-capable assistant read access and optional draft access only to the mailboxes you select. It does not grant permission to send mail.',
    steps: [
      { title: 'Wait for a supported connector release', text: 'The assistant package and installation commands for this workflow are not published yet.' },
      { title: 'Choose mailboxes and permissions', text: 'When connector grants are supported, grant the connection only the mailboxes it needs. Fixture grants are simulated and cannot connect a real assistant.' },
      {
        title: 'Register the server with your assistant',
        text: 'A supported connector will use the one-time connection secret displayed after granting access. Store it securely; it is distinct from an api-user token on the Developer API page. Follow the released connector instructions when available.',
      },
      { title: 'Check access after setup', text: 'Once a supported connector is available, verify that it can read only selected mailboxes and write drafts only where permitted. Sending is not a connector permission.' },
    ],
  },
  {
    slug: 'cli',
    title: 'Elevateo CLI',
    text: 'Work with drafts and conversations from a terminal',
    intro: 'The command-line connector wraps the same gateway endpoints as this app for scripts and automations: search, read, save drafts and review simulated sends.',
    steps: [
      { title: 'Install the connector', text: 'One binary, no daemon.', code: 'npm install --global @elevateo/cli', language: 'bash' },
      { title: 'Sign in', text: 'Store a token for the workspace you work in.', code: 'elevateo auth login --url https://mail.example.test --token <token>', language: 'bash' },
      { title: 'List conversations', text: 'Output is JSON by default so it pipes into other tools.', code: 'elevateo threads list --mailbox <mailbox-id> --filter unread', language: 'bash' },
      { title: 'Save a draft', text: 'Drafts are versioned exactly like in the editor; nothing is sent.', code: 'elevateo drafts save --mailbox <mailbox-id> --to ada@example.test --subject "Hello" --body-file ./message.txt', language: 'bash' },
    ],
  },
]

export function IntegrationsPage() {
  return (
    <LinkCardGrid>
      {INTEGRATIONS.map((integration) => (
        <LinkCard key={integration.slug} to={`/settings/integrations/${integration.slug}`} title={integration.title} text={integration.text} />
      ))}
    </LinkCardGrid>
  )
}

// AIDEV-NOTE: both connection entry points share the availability warning to avoid presenting plans as setup steps.
export function PlannedConnectorNotice() {
  return (
    <Callout variant="neutral" heading="Planned connector setup">
      These steps describe a planned connector workflow. The package names and commands are not published yet.
      This web app uses session sign-in; connection secrets are a separate credential and fixture secrets are simulated.
    </Callout>
  )
}

export function IntegrationDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const integration = INTEGRATIONS.find((candidate) => candidate.slug === slug)
  if (integration === undefined) {
    return (
      <EmptyState
        icon={<PuzzlePieceIcon className="size-5" />}
        title="Integration not found"
        body="This integration does not exist or is not available in your workspace."
        action={<Link to="/settings/integrations" className={buttonClass('primary', 'md')}>All integrations</Link>}
      />
    )
  }
  return (
    <div className="max-w-3xl space-y-6">
      <PlannedConnectorNotice />
      <Card>
        <p className="text-sm text-zinc-800 dark:text-zinc-200">{integration.intro}</p>
      </Card>
      {integration.steps.map((step, index) => (
        <Card key={step.title}>
          <h2 className="text-base font-medium text-zinc-800 dark:text-white">{index + 1}. {step.title}</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{step.text}</p>
          {step.code !== undefined && <CodeBlock code={step.code} {...(step.language === undefined ? {} : { language: step.language })} className="mt-4" />}
        </Card>
      ))}
    </div>
  )
}
