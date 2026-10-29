# frozen_string_literal: true
require "minitest/autorun"
require "minitest/mock"
require_relative "../../lib/elevateo/email_finder/discovery"

class EmailFinderDiscoveryTest < Minitest::Test
  class State
    attr_reader :values
    def initialize = @values = {}
    def state_get(key) = @values.fetch(key, {})
    def state_put(key, value) = @values[key] = value
  end

  def setup
    @state = State.new
    @discovery = Elevateo::EmailFinder::Discovery.new(state: @state)
  end

  def test_all_engine_recorded_html_parses
    %w[duckduckgo bing mojeek].each do |engine|
      html = File.read(File.join(__dir__, "fixtures", "#{engine}.html"))
      result = @discovery.parse_search(engine, html)
      assert_equal "https://example.com/team", result.first.fetch("url")
      assert_match(/Jane Doe/, result.first.fetch("title"))
    end
  end

  def test_all_captchas_are_unavailable_and_backed_off
    response = { "code" => 200, "body" => "<h1>Verify you are human CAPTCHA</h1>", "type" => "text/html" }
    @discovery.stub(:fetch, response) do
      assert @discovery.search("example").fetch("unavailable")
      assert_equal 3, @state.values.length
      assert(@state.values.values.all? { |state| state.fetch("blocked_until") > Time.now.to_f + 21_590 })
    end
    @discovery.stub(:fetch, ->(*) { flunk "blocked engine queried" }) do
      assert @discovery.search("example").fetch("unavailable")
    end
  end

  def test_throttle_and_robots
    @discovery.stub(:fetch, { "code" => 200, "body" => "<html></html>" }) do
      refute @discovery.search("example").fetch("unavailable")
      assert_operator @state.values.fetch("search:duckduckgo").fetch("next_at"), :>=, Time.now.to_f + 9
    end
    rules = "User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\n"
    refute @discovery.robots_allowed?(rules, "/private/team")
    assert @discovery.robots_allowed?(rules, "/private/public")
    refute @discovery.robots_allowed?(rules, "/people.pdf")
    assert @discovery.robots_allowed?(rules, "/team")
  end

  def test_specific_robots_group_replaces_wildcard_and_combines_repeated_groups
    rules = "User-agent: *\nAllow: /private\nUser-agent: EmailFinder\nDisallow: /\nUser-agent: EmailFinder\nAllow: /team\n"
    refute @discovery.robots_allowed?(rules, "/private")
    assert @discovery.robots_allowed?(rules, "/team")
    refute @discovery.robots_allowed?("User-agent: *\nDisallow: /\nUser-agent: NotEmailFinder\nAllow: /team\n", "/team")
    assert @discovery.robots_allowed?("User-agent: *\nDisallow: /\nUser-agent: EmailFinder\nDisallow: /private\n", "/team")
  end

  class HttpFixture
    attr_accessor :ipaddr, :use_ssl, :open_timeout, :read_timeout, :write_timeout
    Response = Struct.new(:code, :body, :headers) do
      def [](key) = headers[key]
      def read_body = yield(body)
    end
    def initialize(host, routes, requests)
      @host, @routes, @requests = host, routes, requests
    end
    def request_get(path, _headers)
      @requests << [@host, path]
      yield Response.new(*@routes.fetch([@host, path]))
    end
  end

  def test_redirect_target_is_checked_before_fetch
    requests = []
    routes = { ["example.com", "/contact"] => ["302", "", { "location" => "/private" }] }
    with_http_fixtures(routes, requests) do
      assert_raises(IOError) do
        @discovery.send(:fetch, "https://example.com/contact", origin: "https://example.com",
          robots_cache: { "https://example.com:443" => "User-agent: *\nDisallow: /private\n" })
      end
    end
    assert_equal [["example.com", "/contact"]], requests
  end

  def test_www_redirect_loads_its_own_robots_policy
    requests = []
    routes = {
      ["example.com", "/contact"] => ["302", "", { "location" => "https://www.example.com/private" }],
      ["www.example.com", "/robots.txt"] => ["200", "User-agent: *\nDisallow: /private\n", {}]
    }
    with_http_fixtures(routes, requests) do
      assert_raises(IOError) do
        @discovery.send(:fetch, "https://example.com/contact", origin: "https://example.com",
          robots_cache: { "https://example.com:443" => "" })
      end
    end
    assert_equal [["example.com", "/contact"], ["www.example.com", "/robots.txt"]], requests
  end

  private

  def with_http_fixtures(routes, requests, &block)
    factory = ->(host, _port, _proxy) { HttpFixture.new(host, routes, requests) }
    Elevateo::EmailFinder::DNS.stub(:address, "93.184.216.34") do
      Net::HTTP.stub(:new, factory, &block)
    end
  end
end
