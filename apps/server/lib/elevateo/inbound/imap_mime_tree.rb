# frozen_string_literal: true

require_relative "imap_mime_error"

module Elevateo
  module Inbound
    # AIDEV-NOTE: Preserve alternative boundaries; two independent bodies must never be silently merged or discarded.
    class ImapMimeTree
      def select(message)
        selection = visit(message, 0, { nodes: 0, leaves: 0 })
        raise MimeRejected, "unsupported_mime" if selection.first.empty?

        selection
      end

      private

      def visit(part, depth, counts)
        counts[:nodes] = counts.fetch(:nodes) + 1
        raise MimeRejected, "invalid_mime" if counts.fetch(:nodes) > 24 || depth > 8
        if part.multipart?
          raise MimeRejected, "unsupported_mime" if part.attachment?

          return multipart(part, depth, counts)
        end
        counts[:leaves] = counts.fetch(:leaves) + 1
        raise MimeRejected, "invalid_mime" if counts.fetch(:leaves) > FakeIngress::MAX_PARTS
        return [[], [part]] if part.attachment?
        raise MimeRejected, "unsupported_mime" unless %w[text/plain text/html].include?(part.mime_type)

        [[part], []]
      end

      def multipart(part, depth, counts)
        # @type var bodies: Array[Mail::Message]
        # @type var attachments: Array[Mail::Message]
        children = part.parts
        raise MimeRejected, "invalid_mime" unless children.length.between?(1, FakeIngress::MAX_PARTS)
        raise MimeRejected, "unsupported_mime" unless %w[multipart/alternative multipart/mixed multipart/related].include?(part.mime_type)

        if part.mime_type == "multipart/alternative"
          return alternatives(children, depth, counts)
        end
        bodies = []
        attachments = []
        children.each do |child|
          selected, attached = visit(child, depth + 1, counts)
          raise MimeRejected, "unsupported_mime" if !bodies.empty? && !selected.empty?

          bodies.concat(selected)
          attachments.concat(attached)
        end
        [bodies, attachments]
      end

      def alternatives(children, depth, counts)
        types = children.map(&:mime_type)
        raise MimeRejected, "unsupported_mime" unless children.length <= 2 && types.uniq.length == types.length &&
          children.all? { |child| !child.multipart? && !child.attachment? && %w[text/plain text/html].include?(child.mime_type) }

        # AIDEV-NOTE: Visit both representations so ignored HTML still consumes limits and receives text validation.
        bodies = children.flat_map { |child| visit(child, depth + 1, counts).first }
        [bodies, []]
      end
    end
  end
end
