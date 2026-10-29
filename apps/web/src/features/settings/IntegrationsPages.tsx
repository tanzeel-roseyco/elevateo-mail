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
    intro: 'The Model Context Protocol server exposes read-only mailbox tools (list conversations, read a message, search) to an MCP-capable assistant. Every call runs under the signed-in actor and the same permissions as this app.',
    steps: [
      { title: 'Install the server', text: 'The server ships as a small package that runs next to your assistant.', code: 'npm install --global @elevateo/mcp-server', language: 'bash' },
      { title: 'Create an API token', text: 'Generate an api-user token on the Developer API page and keep it in your secret manager.' },
      {
        title: 'Register the server with your assistant',
        text: 'Add the server to the assistant configuration. The URL points at the gateway this app talks to.',
        code: '{\n  "mcpServers": {\n    "elevateo": {\n      "command": "elevateo-mcp",\n      "env": { "ELEVATEO_API_URL": "https://mail.example.test/api", "ELEVATEO_API_TOKEN": "<token>" }\n    }\n  }\n}',
        language: 'json',
      },
      { title: 'Try a tool', text: 'Ask the assistant to list unread conversations in a mailbox you can read. Writes (drafts, sends) stay in this app.' },
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
      <Callout variant="neutral" heading="Not connected in this build">
        The steps below describe the planned connector. The package names and commands are not published yet, and the gateway accepts session sign-in only.
      </Callout>
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
