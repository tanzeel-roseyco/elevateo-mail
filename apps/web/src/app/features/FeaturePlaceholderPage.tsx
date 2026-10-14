// Truthful stand-in for a registered feature route whose module has not been integrated into this
// build yet (FE-805). It never simulates data; it names the gap and links back to mail.
import { Link } from 'react-router'
import { buttonClass } from '@/ui/Button'
import { EmptyState } from '@/ui/Async'

export function FeaturePlaceholderPage({ title, owner }: { title: string; owner: string }) {
  return (
    <section aria-labelledby="feature-placeholder-title" className="mx-auto max-w-lg p-8">
      <h1 id="feature-placeholder-title" className="sr-only">{title}</h1>
      <EmptyState
        title={`${title} is not available in this build`}
        body={`This area is registered in the shell, but the ${owner} feature module has not been integrated yet. Nothing here is simulated.`}
        action={<Link to="/" className={buttonClass('secondary')}>Back to mail</Link>}
      />
    </section>
  )
}
