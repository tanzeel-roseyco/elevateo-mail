import { Bot, Construction, LayoutDashboard, Megaphone, Users, type LucideIcon } from 'lucide-react'
import { PageHeader, usePageTitle } from '@/ui/Bits'

// AIDEV-NOTE: Areas the server does not support yet. The page keeps its place in the navigation and says plainly
// that nothing here works; it shows no sample data and no control that could pretend to succeed.

const AREAS = {
  overview: { title: 'Overview', icon: LayoutDashboard, body: 'Activity summaries need delivery, reply and bounce records from a real mail provider. The server does not collect them yet, so there is nothing truthful to summarise.' },
  campaigns: { title: 'Campaigns', icon: Megaphone, body: 'Campaign creation, scheduling and delivery are not available. When they are, the server will schedule and send them; this page will never send a campaign from your browser.' },
  contacts: { title: 'Contacts', icon: Users, body: 'The server can record consent but cannot list contacts yet, so contacts cannot be shown or edited here.' },
  assistant: { title: 'AI Assistant', icon: Bot, body: 'No assistant is connected. The permissions you set in Connections are stored by the server, but nothing reads mail or writes drafts on your behalf yet.' },
} satisfies Record<string, { title: string; icon: LucideIcon; body: string }>

export function UnavailablePage({ area }: { area: keyof typeof AREAS }) {
  const { title, icon: Icon, body } = AREAS[area]
  usePageTitle(title)
  return (
    <>
      <PageHeader title={title} description="Not available yet" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
          <Icon aria-hidden className="size-6" />
        </span>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Construction aria-hidden className="size-4 text-warn" />
          {title} is not available yet
        </h2>
        <p className="max-w-md text-[13px] text-muted">{body}</p>
      </div>
    </>
  )
}
