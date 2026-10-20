# frozen_string_literal: true

module Elevateo
  # AIDEV-NOTE: Search filters authorized message rows; presentation still uses B's latest-message projection.
  module MailSearchSQL
    PAGE = <<~SQL.freeze
      WITH page AS (
        SELECT thread.id, thread.mailbox_id, left(thread.subject, 257) AS subject,
               NOT COALESCE(state.is_read, FALSE) AS unread, thread.folder,
               to_char(thread.snoozed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS snoozed_until,
               COALESCE(star.starred, FALSE) AS starred, latest.id AS latest_id, latest.sent_at AS activity
          FROM app.threads AS thread
          LEFT JOIN app.thread_read_states AS state
            ON state.organization_id = thread.organization_id AND state.mailbox_id = thread.mailbox_id
           AND state.thread_id = thread.id AND state.user_id = $3::uuid
          LEFT JOIN app.thread_stars AS star
            ON star.organization_id = thread.organization_id AND star.mailbox_id = thread.mailbox_id
           AND star.thread_id = thread.id AND star.user_id = $3::uuid
          LEFT JOIN LATERAL (
            SELECT message.id, message.sent_at FROM app.messages AS message
             WHERE message.organization_id = $1::uuid AND message.mailbox_id = thread.mailbox_id
               AND message.thread_id = thread.id
             ORDER BY message.sent_at DESC NULLS LAST, message.id DESC LIMIT 1
          ) AS latest ON TRUE
         WHERE thread.organization_id = $1::uuid AND ($2::uuid IS NULL OR thread.mailbox_id = $2::uuid)
           AND thread.folder NOT IN ('spam', 'trash')
           AND (thread.subject ILIKE $4::text ESCAPE E'\\\\' OR EXISTS (
             SELECT 1 FROM app.messages AS matched
              WHERE matched.organization_id = $1::uuid AND matched.mailbox_id = thread.mailbox_id
                AND matched.thread_id = thread.id
                AND (matched.body_text ILIKE $4::text ESCAPE E'\\\\'
                  OR matched.sender->>'display_name' ILIKE $4::text ESCAPE E'\\\\'
                  OR matched.sender->>'address' ILIKE $4::text ESCAPE E'\\\\'
                  OR EXISTS (SELECT 1 FROM jsonb_array_elements(matched.recipients) AS recipient
                    WHERE recipient->>'display_name' ILIKE $4::text ESCAPE E'\\\\'
                       OR recipient->>'address' ILIKE $4::text ESCAPE E'\\\\'))))
           AND ($5::uuid IS NULL OR
             ($6::timestamptz IS NULL AND latest.sent_at IS NULL AND thread.id < $5::uuid) OR
             ($6::timestamptz IS NOT NULL AND (latest.sent_at IS NULL OR latest.sent_at < $6::timestamptz OR
               (latest.sent_at = $6::timestamptz AND thread.id < $5::uuid))))
         ORDER BY latest.sent_at DESC NULLS LAST, thread.id DESC LIMIT $7::integer
      )
      SELECT page.id, page.mailbox_id, page.subject, page.unread, page.folder, page.snoozed_until,
             page.starred, latest.sender::text AS sender,
             COALESCE(left(latest.body_text, 256), '') AS preview_text,
             to_char(page.activity AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_message_at,
             (SELECT LEAST(count(message.id), 2147483647)::integer FROM app.messages AS message
               WHERE message.organization_id = $1::uuid AND message.mailbox_id = page.mailbox_id
                 AND message.thread_id = page.id) AS message_count
        FROM page LEFT JOIN app.messages AS latest
          ON latest.organization_id = $1::uuid AND latest.mailbox_id = page.mailbox_id
         AND latest.thread_id = page.id AND latest.id = page.latest_id
       ORDER BY page.activity DESC NULLS LAST, page.id DESC
    SQL
  end
end
