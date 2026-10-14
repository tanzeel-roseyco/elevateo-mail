// Honest state for a registered route whose feature gateway capability is absent in this build
// (FE-805). It never simulates data; it names the missing connection and links back to mail.
import { Link } from 'react-router'
import { buttonClass } from '@/ui/Button'
import { EmptyState } from '@/ui/Async'

export function FeatureNotConnectedPage({ title, dependency }: { title: string; dependency: string }) {
  return (
    <section aria-labelledby="feature-not-connected-title" className="mx-auto max-w-lg p-8">
      <h1 id="feature-not-connected-title" className="sr-only">{title}</h1>
      <EmptyState
        title={`${title} is not connected in this build`}
        body={`The page is integrated, but ${dependency} is not available yet. Nothing here is simulated.`}
        action={<Link to="/" className={buttonClass('secondary')}>Back to mail</Link>}
      />
    </section>
  )
}
