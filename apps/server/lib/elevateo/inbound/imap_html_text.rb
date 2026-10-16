# frozen_string_literal: true

require "nokogiri"
require_relative "imap_mime_error"

module Elevateo
  module Inbound
    # AIDEV-NOTE: HTML is decoded to inert text on the worker; URL attributes are never read or fetched.
    class ImapHtmlText
      OMIT = %w[script style template head title iframe object embed svg math noscript].freeze
      BLOCK = %w[address article aside blockquote div dl dt dd fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tr ul].freeze
      MAX_NODES = 16_384

      def convert(html)
        raise MimeRejected, "invalid_text" unless html.valid_encoding? && html.bytesize <= FakeIngress::MAX_TEXT && !html.include?("\0")

        document = Nokogiri::HTML5::Document.parse(html, nil, "UTF-8",
          max_tree_depth: 64, max_attributes: 64, max_errors: 0)
        output = +""
        count = 0
        # AIDEV-NOTE: Iterative traversal caps work and output without recursive string concatenation on nested markup.
        # @type var stack: Array[[Nokogiri::XML::Node, bool]]
        stack = document.children.to_a.reverse.map { |node| [node, false] }
        until stack.empty?
          frame = stack.pop
          break unless frame

          node, closing = frame
          if closing
            append(output, "\n")
            next
          end
          count += 1
          raise MimeRejected, "invalid_text" if count > MAX_NODES
          next if OMIT.include?(node.name)

          if node.text?
            append(output, node.content)
          elsif node.element?
            block = BLOCK.include?(node.name)
            append(output, "\n") if block || node.name == "br"
            stack << [node, true] if block
            node.children.to_a.reverse_each { |child| stack << [child, false] }
          end
        end
        output.gsub(/[ \t\r\f]+/, " ").gsub(/ *\n */, "\n").gsub(/\n{3,}/, "\n\n").strip
      rescue ArgumentError, EncodingError
        raise MimeRejected, "invalid_text"
      end

      private

      def append(output, value)
        raise MimeRejected, "invalid_text" if output.bytesize + value.bytesize > FakeIngress::MAX_TEXT

        output << value
      end
    end
  end
end
