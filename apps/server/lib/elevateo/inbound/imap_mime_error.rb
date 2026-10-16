# frozen_string_literal: true

require_relative "fake_ingress"

module Elevateo
  module Inbound
    # AIDEV-NOTE: Only permanent parser failures may become rejection receipts; transport and storage errors retry.
    class MimeRejected < Rejected
    end
  end
end
