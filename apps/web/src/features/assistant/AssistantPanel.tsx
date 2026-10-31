// Dockable assistant side panel, shown only inside the desktop host (typed capability detection in
// bridge.ts, never user agent). Talks to the native agents bridge through the AgentsBridge port;
// while the native side does not exist it renders an honest "not available" state.
//
// The transcript is plain text only — assistant output is untrusted external content and is never
// rendered as HTML; remote images cannot occur because no markup is interpreted.
//
// AIDEV-NOTE: mounted by Shell via AssistantDock; tests inject a fake bridge through the
// featureGateways `assistant` seam (or the bridge prop), production falls back to createAssistantBridge().
// The panel owns its runtime session: closing (unmounting) it ends that session, a start that resolves
// after close is ended at once, and "ended" is shown only after the runtime confirms termination.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFeatureGateways } from '@/app/featureGateways'
import { EmptyState, ErrorState, Skeleton } from '@/ui/Async'
import { Button, IconButton } from '@/ui/Button'
import { Field, Select, TextArea } from '@/ui/Field'
import { InformationCircleIcon, XMarkIcon } from '@/ui/icons'
import {
  ASSISTANT_RUNTIMES,
  createAssistantBridge,
  detectDesktopHost,
  type AgentEvent,
  type AgentsBridge,
  type AssistantRuntime,
} from './bridge'

const RUNTIME_LABELS: Record<AssistantRuntime, string> = { codex: 'Codex', claude: 'Claude' }

/** What the runtime is allowed to do; mirrors the server-enforced default scope, no send/shell/files. */
const PERMISSIONS_NOTICE =
  'This assistant can read, search and create drafts in the mailboxes you can access. It cannot send mail, run commands, or access files.'
const SHARING_NOTICE = 'What you type here, and any mail content you include, is shared with the external AI runtime.'

type Availability = { status: 'checking' } | { status: 'unavailable'; reason: string } | { status: 'available' }
/** Event-channel readiness: a session may start only once its output can actually be received. */
type Listening = 'connecting' | 'ready' | 'failed'
type SessionState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'start_failed'; message: string }
  | { status: 'active'; sessionId: string; streaming: boolean }
  | { status: 'ending'; sessionId: string }
  | { status: 'end_failed'; sessionId: string }
  | { status: 'ended' }

interface TranscriptEntry {
  role: 'you' | 'assistant' | 'system'
  text: string
}

/**
 * Shell mount point: renders nothing in a plain browser, a toggle plus the docked panel inside the
 * desktop host. An injected bridge (featureGateways or prop) also counts as "hosted" so tests and
 * fixture entries can exercise the panel.
 */
export function AssistantDock({ bridge }: { bridge?: AgentsBridge }) {
  const gateways = useFeatureGateways()
  const injected = bridge ?? gateways.assistant
  const hosted = injected !== undefined || detectDesktopHost() !== null
  const resolved = useMemo(() => injected ?? createAssistantBridge(), [injected])
  const [open, setOpen] = useState(false)
  if (!hosted) return null
  return (
    <>
      <div className="fixed end-4 top-3 z-20">
        <Button variant="outline" size="sm" aria-expanded={open} aria-controls="assistant-panel" onClick={() => setOpen((o) => !o)}>
          Assistant
        </Button>
      </div>
      {open && <AssistantPanel bridge={resolved} onClose={() => setOpen(false)} />}
    </>
  )
}

export function AssistantPanel({ bridge, onClose }: { bridge: AgentsBridge; onClose(): void }) {
  const [availability, setAvailability] = useState<Availability>({ status: 'checking' })
  const [session, setSession] = useState<SessionState>({ status: 'idle' })
  const [runtime, setRuntime] = useState<AssistantRuntime>('codex')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [input, setInput] = useState('')
  const [listening, setListening] = useState<Listening>('connecting')
  const [subscribeAttempt, setSubscribeAttempt] = useState(0)
  // Session whose events are shown and which unmount must end; null while none is owned or ending.
  const sessionRef = useRef<string | null>(null)
  const disposedRef = useRef(false)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void bridge.availability().then(
      (result) => {
        if (cancelled) return
        setAvailability(result.available ? { status: 'available' } : { status: 'unavailable', reason: result.reason })
      },
      () => {
        if (!cancelled) setAvailability({ status: 'unavailable', reason: 'The assistant runtime could not be reached.' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [bridge])

  // One subscription for the panel's lifetime (re-opened by "Try again"); events for other sessions
  // are ignored. Start stays disabled until it is ready, so no early output can be missed.
  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let disposed = false
    const onProtocolError = () => {
      const id = sessionRef.current
      console.error('An assistant event did not match the bridge contract; the current response was stopped.')
      if (id === null) return
      setTranscript((entries) => [...entries, { role: 'system', text: 'The assistant sent an update this app could not read, so the current response was stopped.' }])
      setSession((s) => (s.status === 'active' ? { ...s, streaming: false } : s))
      bridge.cancel(id).catch((error: unknown) => console.error('Cancelling after an unreadable assistant event failed.', error))
    }
    bridge.subscribe((event: AgentEvent) => {
      if (event.session_id !== sessionRef.current) return
      if (event.type === 'output_delta') {
        setTranscript((entries) => {
          const last = entries[entries.length - 1]
          if (last?.role === 'assistant') {
            return [...entries.slice(0, -1), { role: 'assistant', text: last.text + event.text }]
          }
          return [...entries, { role: 'assistant', text: event.text }]
        })
      } else if (event.type === 'completed') {
        setSession((s) => (s.status === 'active' ? { ...s, streaming: false } : s))
      } else if (event.type === 'error') {
        setTranscript((entries) => [...entries, { role: 'system', text: `The runtime reported an error: ${event.message}` }])
        setSession((s) => (s.status === 'active' ? { ...s, streaming: false } : s))
      } else {
        sessionRef.current = null
        setSession({ status: 'ended' })
      }
    }, onProtocolError).then(
      (stop) => {
        if (disposed) stop()
        else {
          unsubscribe = stop
          setListening('ready')
        }
      },
      (error: unknown) => {
        if (disposed) return
        console.error('The assistant event channel could not be connected.', error)
        setListening('failed')
      },
    )
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [bridge, subscribeAttempt])

  // Closing the panel releases the runtime process it owns (P21-2). disposedRef is reset on mount so
  // a StrictMode remount does not leave it set.
  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      const id = sessionRef.current
      if (id === null) return
      sessionRef.current = null
      bridge.end(id).catch((error: unknown) => console.error('The assistant session could not be ended when the panel closed.', error))
    }
  }, [bridge])

  useEffect(() => {
    // Optional call: jsdom has no scrollIntoView; tests must not crash on transcript growth.
    transcriptEndRef.current?.scrollIntoView?.({ block: 'end' })
  }, [transcript])

  const startSession = useCallback(() => {
    setSession({ status: 'starting' })
    bridge.start(runtime).then(
      (sessionId) => {
        if (disposedRef.current) {
          // The panel closed while starting: nobody can use this session, so release it now.
          bridge.end(sessionId).catch((error: unknown) => console.error('A session started after the panel closed could not be ended.', error))
          return
        }
        sessionRef.current = sessionId
        setTranscript([])
        setSession({ status: 'active', sessionId, streaming: false })
      },
      (error: unknown) => {
        setSession({ status: 'start_failed', message: error instanceof Error ? error.message : 'The session could not be started.' })
      },
    )
  }, [bridge, runtime])

  const sendMessage = useCallback(() => {
    // One turn at a time: events carry no turn id, so a second send would interleave replies (P21-4).
    if (session.status !== 'active' || session.streaming) return
    const text = input.trim()
    if (text === '') return
    setInput('')
    setTranscript((entries) => [...entries, { role: 'you', text }])
    setSession({ ...session, streaming: true })
    bridge.send(session.sessionId, text).catch((error: unknown) => {
      setTranscript((entries) => [
        ...entries,
        { role: 'system', text: error instanceof Error ? error.message : 'The message could not be delivered.' },
      ])
      setSession((s) => (s.status === 'active' ? { ...s, streaming: false } : s))
    })
  }, [bridge, input, session])

  const cancelTurn = useCallback(() => {
    if (session.status !== 'active') return
    bridge.cancel(session.sessionId).catch(() => {
      setTranscript((entries) => [...entries, { role: 'system', text: 'Cancel could not be delivered to the runtime.' }])
    })
  }, [bridge, session])

  // "Ended" is shown only after the runtime confirms; a failure keeps the id for a retry (P21-3).
  const endSession = useCallback(() => {
    if (session.status !== 'active' && session.status !== 'end_failed') return
    const id = session.sessionId
    sessionRef.current = null
    setSession({ status: 'ending', sessionId: id })
    bridge.end(id).then(
      () => setSession((s) => (s.status === 'ending' && s.sessionId === id ? { status: 'ended' } : s)),
      (error: unknown) => {
        console.error('The assistant session could not be ended.', error)
        if (disposedRef.current) return
        // Owned again, so a later close still tries to end it.
        sessionRef.current = id
        setSession((s) => (s.status === 'ending' && s.sessionId === id ? { status: 'end_failed', sessionId: id } : s))
      },
    )
  }, [bridge, session])

  const retrySubscription = useCallback(() => {
    setListening('connecting')
    setSubscribeAttempt((attempt) => attempt + 1)
  }, [])

  return (
    <aside
      id="assistant-panel"
      role="complementary"
      aria-label="Assistant"
      className="fixed inset-y-0 end-0 z-20 flex w-full max-w-sm flex-col border-s border-line bg-surface shadow-lg  "
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3 ">
        <h2 className="flex-1 font-medium text-fg ">Assistant</h2>
        <IconButton label="Close assistant" variant="subtle" size="sm" onClick={onClose}>
          <XMarkIcon className="size-4" />
        </IconButton>
      </header>

      {availability.status === 'checking' && (
        <div role="status" aria-label="Checking assistant availability" className="p-4">
          <Skeleton rows={3} />
        </div>
      )}

      {availability.status === 'unavailable' && (
        <div className="p-4">
          <EmptyState
            icon={<InformationCircleIcon className="size-5" />}
            title="Assistant runtime not available"
            body={availability.reason}
          />
        </div>
      )}

      {availability.status === 'available' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-line px-4 py-3 text-xs text-muted  ">
            <p>{PERMISSIONS_NOTICE}</p>
            <p className="mt-1">{SHARING_NOTICE}</p>
          </div>

          {(session.status === 'idle' || session.status === 'starting' || session.status === 'start_failed' || session.status === 'ended') && (
            <div className="flex flex-col gap-3 p-4">
              {session.status === 'start_failed' && (
                <ErrorState title="The session could not be started" body={session.message} />
              )}
              {session.status === 'ended' && (
                <p role="status" className="text-sm text-muted ">
                  The session has ended. Start a new one to continue.
                </p>
              )}
              {listening === 'failed' && (
                <ErrorState
                  title="Assistant replies could not be connected"
                  body="Responses cannot be shown until the connection to the desktop runtime works."
                  action={<Button size="sm" onClick={retrySubscription}>Try again</Button>}
                />
              )}
              {listening === 'connecting' && (
                <p role="status" className="text-sm text-muted ">Connecting to the assistant runtime…</p>
              )}
              <Field id="assistant-runtime" label="Runtime">
                <Select
                  id="assistant-runtime"
                  value={runtime}
                  disabled={session.status === 'starting'}
                  onChange={(e) => setRuntime(e.target.value as AssistantRuntime)}
                >
                  {ASSISTANT_RUNTIMES.map((value) => (
                    <option key={value} value={value}>
                      {RUNTIME_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="primary" disabled={session.status === 'starting' || listening !== 'ready'} onClick={startSession}>
                {session.status === 'starting' ? 'Starting…' : 'Start session'}
              </Button>
            </div>
          )}

          {session.status === 'ending' && (
            <p role="status" className="p-4 text-sm text-muted ">Ending the session…</p>
          )}

          {session.status === 'end_failed' && (
            <div className="p-4">
              <ErrorState
                title="The session may still be running"
                body="The runtime did not confirm that the session ended."
                action={<Button size="sm" onClick={endSession}>Try ending again</Button>}
              />
            </div>
          )}

          {session.status === 'active' && (
            <>
              <div role="log" aria-label="Transcript" className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {transcript.length === 0 ? (
                  <p className="text-sm text-muted ">
                    No messages yet. Ask the assistant to find a conversation or prepare a draft.
                  </p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {transcript.map((entry, index) => (
                      <li key={index} className="text-sm">
                        <span className="block text-xs font-medium text-muted ">
                          {entry.role === 'you' ? 'You' : entry.role === 'assistant' ? RUNTIME_LABELS[runtime] : 'Notice'}
                        </span>
                        {/* Plain text only: assistant output must never be parsed as HTML. */}
                        <span className="whitespace-pre-wrap break-words text-fg ">{entry.text}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <div ref={transcriptEndRef} />
              </div>
              <p role="status" aria-live="polite" className="sr-only">
                {session.streaming ? 'The assistant is responding.' : 'The assistant is idle.'}
              </p>
              <div className="flex flex-col gap-2 border-t border-line p-4 ">
                <Field id="assistant-input" label="Message">
                  <TextArea
                    id="assistant-input"
                    rows={3}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about your mail…"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" disabled={input.trim() === '' || session.streaming} onClick={sendMessage}>
                    Send
                  </Button>
                  <Button size="sm" disabled={!session.streaming} onClick={cancelTurn}>
                    Cancel response
                  </Button>
                  <Button variant="ghost" size="sm" onClick={endSession}>
                    End session
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
