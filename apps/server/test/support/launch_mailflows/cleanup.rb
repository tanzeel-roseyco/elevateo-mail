# frozen_string_literal: true

# AIDEV-NOTE: Failure in one disposable fixture cleanup must not skip credentials or superclass cleanup.
module LaunchMailflowCleanup
  def self.run(steps)
    failures = []
    steps.each do |step|
      begin
        step.call
      rescue StandardError => error
        failures << error
      end
    end
    raise failures.first, cause: failures[1] unless failures.empty?
  end
end
