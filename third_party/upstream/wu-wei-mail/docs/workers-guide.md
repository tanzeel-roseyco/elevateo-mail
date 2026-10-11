# Workers and Scheduler Guide

Wu Wei Mail uses Celery + Redis for campaign scheduling, email delivery, event processing, warmup, and workflow runtime.

## Architecture

- API (`FastAPI`) enqueues tasks.
- Beat enqueues periodic tasks.
- Workers consume queues.
- Redis is the broker/result backend.
- PostgreSQL stores campaign, send, and event state.

## Queue Strategy

Celery config is in `backend/app/workers/celery_app.py`.

- `default` queue: scheduler, event processor, warmup, workflow, auto-responder, cron.
- `sender` queue: `app.workers.sender.send_email_task`.

Routing sender load to `sender` prevents high-volume campaign sends from starving scheduler/control tasks.

## Sender Reliability Model

`backend/app/workers/sender.py` now uses phased persistence:

1. Reserve send attempt in DB (`SentEmail` status `sending`).
2. Call provider transport (`SMTP`, `Gmail API`, or `Microsoft Graph`).
3. Commit sent marker (`status=sent`, `message_id`) before side effects.
4. Finalize counters, lead progression, and outbound inbox message idempotently.

If DB commits fail after provider accept, retries recover from existing `sending/sent` records and avoid duplicate provider sends.

## Running Locally

Open four terminals in `backend`:

Terminal 1 - API
```bash
uvicorn app.main:app --reload --port 8000
```

Terminal 2 - default worker
```bash
celery -A app.workers.celery_app worker --loglevel=info -Q default
```

Terminal 3 - sender worker
```bash
celery -A app.workers.celery_app worker --loglevel=info -Q sender
```

Terminal 4 - beat (single instance)
```bash
celery -A app.workers.celery_app beat --loglevel=info
```

## Production Topology

Deploy as separate processes/containers:

1. API
2. Worker (`-Q default`)
3. Worker (`-Q sender`)
4. Exactly one beat instance

Do not run multiple beat instances.
