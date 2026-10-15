# frozen_string_literal: true

module Elevateo
  module Inbound
    module ImapCleanup
      # AIDEV-NOTE: Cleanup already points to the original primary; copying primary avoids a circular cause chain.
      # AIDEV-NOTE: The copy retains class, message, backtrace and instance state; original identity remains in the chain.
      def self.reraise(primary, cleanup)
        raise primary if primary.equal?(cleanup)

        raise primary.dup, cause: cleanup
      end
    end
  end
end
