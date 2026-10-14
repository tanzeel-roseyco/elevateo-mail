# frozen_string_literal: true

# AIDEV-NOTE: The container publishes no host port; this listener exists only on its isolated Compose network.
bind "tcp://0.0.0.0:4708"
threads 0, 4
workers 1
environment "production"
