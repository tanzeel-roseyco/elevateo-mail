"""Celery application configuration."""

from celery import Celery
from celery.schedules import crontab
from kombu import Queue
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "wuweimail",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.scheduler",
        "app.workers.sender",
        "app.workers.warmup",
        "app.workers.event_processor",
        "app.workers.auto_responder_worker",
        "app.workers.inbox_sync_worker",
        "app.workers.lead_personalization_worker",
        "app.workers.workflow_runner",
        "app.workers.cron_trigger",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=4,
    # Task timeouts
    task_soft_time_limit=120,  # Soft limit: 2 minutes (raises SoftTimeLimitExceeded)
    task_time_limit=180,  # Hard kill: 3 minutes
    # Retry defaults
    task_default_retry_delay=60,  # 1 minute between retries
    task_default_max_retries=3,
    # Rate limiting — per-worker, not system-wide
    task_default_rate_limit="100/s",
    # Result expiry
    result_expires=3600,  # Expire results after 1 hour
    # Dedicated queues: keep high-volume sender tasks isolated from control tasks
    task_default_queue="default",
    task_default_routing_key="default",
    task_queues=(
        Queue("default", routing_key="default"),
        Queue("sender", routing_key="sender"),
    ),
    task_routes={
        "app.workers.sender.send_email_task": {"queue": "sender", "routing_key": "sender"},
    },
)

# Periodic tasks
celery_app.conf.beat_schedule = {
    "campaign-scheduler": {
        "task": "app.workers.scheduler.run_scheduler",
        "schedule": 60.0,  # Every 60 seconds
    },
    "warmup-orchestrator": {
        "task": "app.workers.warmup.warmup_orchestrator",
        "schedule": crontab(minute="*/15"),  # Every 15 minutes
    },
    "warmup-provider-sync": {
        "task": "app.workers.warmup.warmup_provider_sync",
        "schedule": 300.0,  # Every 5 minutes
    },
    "warmup-health-recompute": {
        "task": "app.workers.warmup.warmup_health_recompute",
        "schedule": crontab(minute=0),  # Every hour
    },
    "process-events": {
        "task": "app.workers.event_processor.process_events",
        "schedule": 120.0,  # Every 2 minutes
    },
    "reset-daily-counts": {
        "task": "app.workers.scheduler.reset_daily_counts",
        "schedule": crontab(hour=0, minute=0),  # Midnight UTC
    },
    "auto-responder-retry": {
        "task": "app.workers.auto_responder_worker.retry_failed_responses",
        "schedule": 300.0,  # Every 5 minutes
    },
    "auto-responder-cleanup": {
        "task": "app.workers.auto_responder_worker.cleanup_old_logs",
        "schedule": crontab(hour=3, minute=0),  # Daily at 3 AM UTC
    },
    "inbox-sync": {
        "task": "app.workers.inbox_sync_worker.sync_inboxes",
        "schedule": 90.0,  # Every 90 seconds
    },
    "workflow-runner": {
        "task": "app.workers.workflow_runner.process_workflow_leads",
        "schedule": 30.0,  # Every 30 seconds
    },
    "cron-trigger": {
        "task": "app.workers.cron_trigger.evaluate_cron_triggers",
        "schedule": 60.0,  # Every 60 seconds
    },
}
