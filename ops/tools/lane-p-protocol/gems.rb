# AIDEV-NOTE: RUBYOPT activates pinned gems in every fresh Ruby child without changing frozen test sources.
abort "Ruby mismatch" unless RUBY_VERSION == "3.4.11"
gem "minitest", "6.0.6"
gem "minitest-mock", "5.27.0"
gem "base64", "0.3.0"
