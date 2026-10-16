-- AIDEV-NOTE: Draft scans use independent ownership and leases; only the worker login can claim or record verdicts.
CREATE FUNCTION app.due_draft_attachment_scans(p_limit integer) RETURNS TABLE(id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
BEGIN
  IF session_user <> 'elevateo_worker' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'scan unavailable' USING ERRCODE = '42501';
  END IF;
  -- AIDEV-NOTE: A crash on attempt three must settle as held failure, not leave pending metadata forever.
  WITH exhausted AS (
    SELECT a.id FROM app.draft_attachments a
      WHERE a.scan_status = 'pending_scan' AND a.scan_attempt = 3 AND a.scan_token IS NOT NULL
        AND a.scan_started_at < clock_timestamp() - interval '2 minutes'
      ORDER BY a.scan_started_at, a.id LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE app.draft_attachments a SET scan_status = 'scan_failed', scan_token = NULL,
    scan_started_at = NULL, scan_next_at = NULL, scan_updated_at = clock_timestamp()
    FROM exhausted WHERE a.id = exhausted.id;
  RETURN QUERY SELECT a.id FROM app.draft_attachments a
    WHERE a.scan_status IN ('pending_scan', 'scan_failed') AND a.scan_attempt < 3
      AND (a.scan_next_at IS NULL OR a.scan_next_at <= clock_timestamp())
      AND (a.scan_token IS NULL OR a.scan_started_at < clock_timestamp() - interval '2 minutes')
    ORDER BY a.created_at, a.id LIMIT p_limit;
END
$$;
CREATE FUNCTION app.claim_draft_attachment_scan(p_id uuid, p_token uuid)
  RETURNS TABLE(storage_key text, byte_size integer, sha256 text, scan_attempt integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app, app_drafts_private AS $$
BEGIN
  IF session_user <> 'elevateo_worker' OR p_id IS NULL OR p_token IS NULL THEN
    RAISE EXCEPTION 'scan unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY UPDATE app.draft_attachments a SET scan_status = 'pending_scan',
    scan_attempt = a.scan_attempt + 1, scan_token = p_token, scan_started_at = clock_timestamp(), scan_next_at = NULL
    FROM app_drafts_private.attachment_stage_operations operation
    WHERE a.id = p_id AND operation.attachment_id = a.id AND operation.stage_state = 'committed'
      AND a.scan_status IN ('pending_scan', 'scan_failed') AND a.scan_attempt < 3
      AND (a.scan_next_at IS NULL OR a.scan_next_at <= clock_timestamp())
      AND (a.scan_token IS NULL OR a.scan_started_at < clock_timestamp() - interval '2 minutes')
    RETURNING operation.object_key, operation.byte_size, operation.sha256, a.scan_attempt;
END
$$;
CREATE FUNCTION app.record_draft_attachment_scan(p_id uuid, p_sha text, p_token uuid,
  p_attempt integer, p_verdict text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app, app_drafts_private AS $$
BEGIN
  IF session_user <> 'elevateo_worker' OR p_id IS NULL OR p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$'
    OR p_token IS NULL OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 3 OR p_verdict IS NULL
    OR p_verdict NOT IN ('clean', 'malware', 'scan_failed') THEN
    RAISE EXCEPTION 'scan unavailable' USING ERRCODE = '42501';
  END IF;
  UPDATE app.draft_attachments a SET scan_status = p_verdict, scan_token = NULL,
    scan_started_at = NULL, scan_updated_at = clock_timestamp(),
    scan_next_at = CASE WHEN p_verdict = 'scan_failed' AND p_attempt < 3
      THEN clock_timestamp() + make_interval(secs => 30 * (1 << p_attempt)) ELSE NULL END
    FROM app_drafts_private.attachment_stage_operations operation
    WHERE a.id = p_id AND operation.attachment_id = a.id AND operation.stage_state = 'committed'
      AND operation.sha256 = p_sha AND a.scan_status = 'pending_scan'
      AND a.scan_token = p_token AND a.scan_attempt = p_attempt;
  RETURN FOUND;
END
$$;
