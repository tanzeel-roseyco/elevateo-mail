-- AIDEV-NOTE: No CASCADE: later dependants must roll back first instead of silently losing unrelated objects.
DROP TABLE app.thread_read_states;
DROP TABLE app.messages;
DROP TABLE app.threads;
DROP FUNCTION app.thread_recipients_valid(jsonb);
DROP FUNCTION app.thread_address_valid(jsonb);
