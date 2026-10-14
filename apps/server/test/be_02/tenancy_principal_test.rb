# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/tenancy"

class TenancyPrincipalTest < Minitest::Test
  Principal = Elevateo::Tenancy::Principal
  USER = "ABCDEF01-2345-6789-ABCD-EF0123456789"
  ORG = "FEDCBA98-7654-3210-FEDC-BA9876543210"

  def test_generated_parent_preserves_owned_frozen_value_identity
    user, org = USER.dup, ORG.dup
    principal = Principal.new(user_id: user, org_id: org)
    equivalent = Principal.new(user_id: USER.downcase, org_id: ORG.downcase)
    user.replace("changed")
    org.replace("changed")

    assert_equal USER.downcase, principal.user_id
    assert_equal ORG.downcase, principal.org_id
    assert_equal principal, equivalent
    assert principal.eql?(equivalent)
    assert_equal principal.hash, equivalent.hash
    assert_instance_of Principal, principal
    assert principal.frozen?
    assert_raises(FrozenError) { principal.user_id.replace("changed") }
    assert_raises(FrozenError) { principal.org_id.replace("changed") }
    refute_equal principal, Principal.new(user_id: ORG, org_id: USER)
  end

  def test_invalid_identity_is_rejected_for_each_member
    [nil, "", "x" * 37, 1, [], {}, USER + "\n"].each do |invalid|
      assert_raises(Elevateo::Tenancy::ContextError) { Principal.new(user_id: invalid, org_id: ORG) }
      assert_raises(Elevateo::Tenancy::ContextError) { Principal.new(user_id: USER, org_id: invalid) }
    end
  end

  def test_generated_parent_is_not_an_authorized_principal
    # AIDEV-NOTE: The typed generated parent must never satisfy the tenant authority boundary.
    parent = Principal.superclass.new(user_id: USER, org_id: ORG)
    refute_kind_of Principal, parent
    assert_raises(Elevateo::Tenancy::ContextError) do
      Elevateo::Tenancy.with_context(parent, connection: Object.new) { flunk "unvalidated parent yielded" }
    end
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
  end
end
