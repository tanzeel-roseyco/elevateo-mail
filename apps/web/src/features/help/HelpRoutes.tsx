// Help centre (DESIGN-SPEC §6, help-center/INDEX.md structure): home with search and collection
// cards, collection pages, article pages with breadcrumb and "Copy for LLM", the Community page
// and a search results view. All copy is Elevateo's own (features/help/content.ts).
import { useId, useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router'
import { cx } from '@/lib/format'
import { EmptyState } from '@/ui/Async'
import { Breadcrumbs, type Crumb } from '@/ui/Breadcrumbs'
import { Button, buttonClass } from '@/ui/Button'
import { Callout } from '@/ui/Callout'
import { Card, LinkCard } from '@/ui/Card'
import { CodeBlock, useCopy } from '@/ui/CodeBlock'
import { inputClass } from '@/ui/Field'
import { PageHeader, SectionHeader } from '@/ui/PageHeader'
import { BookOpenIcon, ChatBubbleLeftRightIcon, DocumentDuplicateIcon, MagnifyingGlassIcon, UserGroupIcon } from '@/ui/icons'
import { ARTICLES, COLLECTIONS, articleToMarkdown, articlesIn, findArticle, findCollection, searchArticles, type Article, type Block } from './content'

export function HelpRoutes() {
  return (
    <Routes>
      <Route index element={<HelpHomePage />} />
      <Route path="search" element={<HelpSearchPage />} />
      <Route path="collections/:slug" element={<CollectionPage />} />
      <Route path="articles/:slug" element={<ArticlePage />} />
      <Route path="community" element={<CommunityPage />} />
      <Route path="*" element={<Navigate to="/help" replace />} />
    </Routes>
  )
}

function HelpSearchForm({ initial = '', autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const [query, setQuery] = useState(initial)
  const navigate = useNavigate()
  const id = useId()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    void navigate(trimmed === '' ? '/help' : `/help/search?q=${encodeURIComponent(trimmed)}`)
  }
  return (
    <form role="search" aria-label="Search help articles" onSubmit={submit} className="flex max-w-2xl gap-2">
      <label htmlFor={id} className="sr-only">Search help articles</label>
      <span className="relative flex-1">
        <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
        <input id={id} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for articles..." autoFocus={autoFocus} className={cx(inputClass, 'h-10 ps-10')} />
      </span>
      <Button type="submit" variant="primary">Search</Button>
    </form>
  )
}

function HelpHomePage() {
  return (
    <section aria-label="Help centre">
      <PageHeader title="Help Centre" subtitle="Guides for every part of Elevateo Mail" help={false} actions={<Link to="/help/community" className={buttonClass('outline', 'xs')}><UserGroupIcon className="size-4" />Community</Link>} />
      <HelpSearchForm />
      <SectionHeader title="Collections" subtitle={`${COLLECTIONS.length} collections · ${ARTICLES.length} articles`} />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Collections">
        {COLLECTIONS.map((collection) => {
          const count = articlesIn(collection.slug).length
          return (
            <li key={collection.slug}>
              <LinkCard to={`/help/collections/${collection.slug}`} title={collection.title} text={`${collection.description} ${count} article${count === 1 ? '' : 's'}.`} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function HelpSearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const results = searchArticles(q)
  return (
    <section aria-label="Help search">
      <Breadcrumbs crumbs={[{ label: 'Help Centre', to: '/help' }, { label: 'Search' }]} />
      <PageHeader title="Search results" subtitle={q === '' ? 'Enter a word or phrase to search the help centre.' : `${results.length} article${results.length === 1 ? '' : 's'} matching “${q}”`} help={false} />
      <HelpSearchForm initial={q} autoFocus />
      <div className="mt-8 max-w-3xl">
        {q === '' && <EmptyState icon={<MagnifyingGlassIcon className="size-5" />} title="Search the help centre" body="Try words like draft, consent, members or shortcuts." />}
        {q !== '' && results.length === 0 && <EmptyState icon={<MagnifyingGlassIcon className="size-5" />} title="No articles match" body="Try a shorter word, or browse the collections." action={<Link to="/help" className={buttonClass('primary', 'md')}>Browse collections</Link>} />}
        {results.length > 0 && <ArticleList articles={results} />}
      </div>
    </section>
  )
}

function ArticleList({ articles }: { articles: readonly Article[] }) {
  return (
    <Card className="p-0">
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-700" aria-label="Articles">
        {articles.map((article) => (
          <li key={article.slug}>
            <Link to={`/help/articles/${article.slug}`} className="block px-6 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800">
              <p className="text-sm font-medium text-zinc-800 dark:text-white">{article.title}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{article.summary}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function CollectionPage() {
  const { slug } = useParams<{ slug: string }>()
  const collection = slug === undefined ? undefined : findCollection(slug)
  if (collection === undefined) return <NotFound what="collection" />
  const articles = articlesIn(collection.slug)
  return (
    <section aria-label={collection.title}>
      <Breadcrumbs crumbs={[{ label: 'Help Centre', to: '/help' }, { label: collection.title }]} />
      <PageHeader title={collection.title} subtitle={collection.description} help={false} />
      <div className="max-w-3xl">
        {articles.length === 0 ? <EmptyState icon={<BookOpenIcon className="size-5" />} title="No articles yet" body="This collection is being written." /> : <ArticleList articles={articles} />}
      </div>
    </section>
  )
}

function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const article = slug === undefined ? undefined : findArticle(slug)
  if (article === undefined) return <NotFound what="article" />
  const collection = findCollection(article.collection)
  const crumbs: Crumb[] = [{ label: 'Help Centre', to: '/help' }]
  if (collection) crumbs.push({ label: collection.title, to: `/help/collections/${collection.slug}` })
  crumbs.push({ label: article.title })
  return (
    <article aria-labelledby="help-article-title">
      <Breadcrumbs crumbs={crumbs} />
      <PageHeader title={article.title} subtitle={article.summary} help={false} actions={<CopyForLlmButton article={article} />} />
      <div className="max-w-3xl space-y-4 text-sm leading-6 text-zinc-800 dark:text-zinc-200">
        <h2 id="help-article-title" className="sr-only">{article.title}</h2>
        {article.blocks.map((block, index) => <BlockView key={index} block={block} />)}
      </div>
      {collection && (
        <div className="mt-10 max-w-3xl">
          <SectionHeader title={`More in ${collection.title}`} />
          <ArticleList articles={articlesIn(collection.slug).filter((candidate) => candidate.slug !== article.slug)} />
        </div>
      )}
    </article>
  )
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'p':
      return <p>{block.text}</p>
    case 'note':
      return <Callout variant="accent">{block.text}</Callout>
    case 'list':
      return <ul className="list-disc space-y-1 ps-5">{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
    case 'steps':
      return <ol className="list-decimal space-y-1 ps-5">{block.items.map((item) => <li key={item}>{item}</li>)}</ol>
    case 'code':
      return <CodeBlock code={block.code} {...(block.language === undefined ? {} : { language: block.language })} />
  }
}

/** Copies the article as Markdown so it can be pasted into an assistant prompt. */
function CopyForLlmButton({ article }: { article: Article }) {
  const [status, copy] = useCopy()
  return (
    <Button variant="outline" size="xs" icon={<DocumentDuplicateIcon className="size-4" />} onClick={() => void copy(articleToMarkdown(article))} aria-live="polite">
      {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy for LLM'}
    </Button>
  )
}

function CommunityPage() {
  return (
    <section aria-label="Community">
      <Breadcrumbs crumbs={[{ label: 'Help Centre', to: '/help' }, { label: 'Community' }]} />
      <PageHeader title="Community" subtitle="Where Elevateo teams compare notes" help={false} />
      <div className="max-w-3xl space-y-6">
        <Callout variant="neutral" icon heading="No public community space yet">
          Elevateo does not run a public chat or forum in this build. Ask your workspace operator for the internal channel your team uses, or browse the help centre.
        </Callout>
        <Card>
          <h2 className="flex items-center gap-2 text-base font-medium text-zinc-800 dark:text-white"><ChatBubbleLeftRightIcon className="size-5 text-zinc-400" />Ways to get help</h2>
          <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-zinc-800 dark:text-zinc-200">
            <li>Search the <Link to="/help" className="font-medium text-(--color-accent-content) underline-offset-4 hover:underline">help centre</Link> for guides and walkthroughs.</li>
            <li>Use "Copy for LLM" on any article to bring its content into your assistant.</li>
            <li>Quote the request id from an error message when you contact your operator.</li>
          </ul>
        </Card>
      </div>
    </section>
  )
}

function NotFound({ what }: { what: 'collection' | 'article' }) {
  return (
    <section aria-label="Help centre">
      <Breadcrumbs crumbs={[{ label: 'Help Centre', to: '/help' }, { label: 'Not found' }]} />
      <PageHeader title={what === 'article' ? 'Article not found' : 'Collection not found'} help={false} />
      <EmptyState icon={<BookOpenIcon className="size-5" />} title={`This ${what} does not exist`} body="It may have moved. Browse the collections or search for a topic." action={<Link to="/help" className={buttonClass('primary', 'md')}>Browse collections</Link>} />
    </section>
  )
}
