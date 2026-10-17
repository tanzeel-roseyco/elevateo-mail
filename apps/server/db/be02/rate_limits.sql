-- AIDEV-NOTE: Fixed-order upserts lock each bucket before a single wall-time check resets its window and attempts.
CREATE FUNCTION app_auth.consume_entry_limits(p_email_digest text, p_ip_digest text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE email_bucket app_auth.rate_limits; ip_bucket app_auth.rate_limits; retry_at timestamptz;
  checked_at timestamptz;
BEGIN
  PERFORM app_auth.check_digest(p_email_digest);
  PERFORM app_auth.check_digest(p_ip_digest);
  -- Worker reconciliation expires old buckets separately, avoiding cleanup/upsert lock-order inversions.
  INSERT INTO app_auth.rate_limits(kind, digest, window_start, attempts)
    VALUES ('email', p_email_digest, clock_timestamp(), 1)
    ON CONFLICT (kind, digest) DO UPDATE SET
      attempts = LEAST(6, app_auth.rate_limits.attempts + 1) RETURNING * INTO email_bucket;
  checked_at := clock_timestamp();
  IF email_bucket.window_start <= checked_at - interval '15 minutes' THEN
    UPDATE app_auth.rate_limits SET attempts = 1, window_start = checked_at
      WHERE kind = 'email' AND digest = p_email_digest RETURNING * INTO email_bucket;
  END IF;
  INSERT INTO app_auth.rate_limits(kind, digest, window_start, attempts)
    VALUES ('ip', p_ip_digest, clock_timestamp(), 1)
    ON CONFLICT (kind, digest) DO UPDATE SET
      attempts = LEAST(31, app_auth.rate_limits.attempts + 1) RETURNING * INTO ip_bucket;
  checked_at := clock_timestamp();
  IF ip_bucket.window_start <= checked_at - interval '15 minutes' THEN
    UPDATE app_auth.rate_limits SET attempts = 1, window_start = checked_at
      WHERE kind = 'ip' AND digest = p_ip_digest RETURNING * INTO ip_bucket;
  END IF;
  IF email_bucket.attempts <= 5 AND ip_bucket.attempts <= 30 THEN RETURN '{"status":"ok"}'::jsonb; END IF;
  retry_at := GREATEST(CASE WHEN email_bucket.attempts > 5 THEN email_bucket.window_start END,
    CASE WHEN ip_bucket.attempts > 30 THEN ip_bucket.window_start END) + interval '15 minutes';
  RETURN jsonb_build_object('status', 'rate_limited', 'retry_after',
    GREATEST(1, CEIL(EXTRACT(epoch FROM retry_at - clock_timestamp()))::integer));
END $$;
