"""Tests for the TemplateEngine — spintax, conditionals, merge tags, validation."""

import pytest

from app.services.template_engine import TemplateEngine


@pytest.fixture
def engine():
    return TemplateEngine()


# ---------------------------------------------------------------------------
# Variable extraction
# ---------------------------------------------------------------------------

class TestExtractVariables:

    def test_simple_merge_tags(self, engine):
        result = engine.extract_variables("Hello {{first_name}}, welcome to {{company}}!")
        assert "first_name" in result
        assert "company" in result

    def test_merge_tags_with_fallback(self, engine):
        result = engine.extract_variables('Hi {{first_name|"there"}}')
        assert "first_name" in result

    def test_conditional_variables(self, engine):
        result = engine.extract_variables("{{#if company}}At {{company}}{{/if}}")
        assert "company" in result

    def test_no_variables(self, engine):
        result = engine.extract_variables("Plain text, no tags here.")
        assert result == []

    def test_duplicate_variables_deduplicated(self, engine):
        result = engine.extract_variables("{{first_name}} and {{first_name}}")
        assert result == ["first_name"]

    def test_mixed_variables(self, engine):
        template = '{{#if title}}{{title}} at {{company}}{{else}}Hi {{first_name|"friend"}}{{/if}}'
        result = engine.extract_variables(template)
        assert "title" in result
        assert "company" in result
        assert "first_name" in result


# ---------------------------------------------------------------------------
# Spintax resolution
# ---------------------------------------------------------------------------

class TestSpintax:

    def test_basic_spintax(self, engine):
        result = engine.resolve_spintax("{Hello|Hey|Hi}", seed=42)
        assert result in ["Hello", "Hey", "Hi"]

    def test_deterministic_with_seed(self, engine):
        """Same seed → same result every time."""
        r1 = engine.resolve_spintax("{Hello|Hey|Hi}", seed=42)
        r2 = engine.resolve_spintax("{Hello|Hey|Hi}", seed=42)
        assert r1 == r2

    def test_different_seeds_can_differ(self, engine):
        """Different seeds CAN produce different results (not guaranteed, but likely for enough seeds)."""
        results = set()
        for seed in range(100):
            results.add(engine.resolve_spintax("{A|B|C}", seed=seed))
        assert len(results) > 1  # At least 2 different outcomes

    def test_no_spintax_passthrough(self, engine):
        result = engine.resolve_spintax("No spintax here", seed=1)
        assert result == "No spintax here"

    def test_multiple_spintax_blocks(self, engine):
        result = engine.resolve_spintax("{Hello|Hey} {world|there}", seed=10)
        parts = result.split(" ")
        assert parts[0] in ["Hello", "Hey"]
        assert parts[1] in ["world", "there"]

    def test_single_option(self, engine):
        """Spintax with a pipe but same options still works."""
        result = engine.resolve_spintax("{only|only}", seed=1)
        assert result == "only"


# ---------------------------------------------------------------------------
# Conditional resolution
# ---------------------------------------------------------------------------

class TestConditionals:

    def test_truthy_condition(self, engine):
        result = engine.resolve_conditionals(
            "{{#if company}}At {{company}}{{/if}}",
            {"company": "Acme"},
        )
        assert "At {{company}}" == result  # merge tags not resolved yet

    def test_falsy_condition_empty_string(self, engine):
        result = engine.resolve_conditionals(
            "{{#if company}}At {{company}}{{else}}No company{{/if}}",
            {"company": ""},
        )
        assert result == "No company"

    def test_falsy_condition_missing(self, engine):
        result = engine.resolve_conditionals(
            "{{#if company}}At {{company}}{{else}}No company{{/if}}",
            {},
        )
        assert result == "No company"

    def test_falsy_condition_none(self, engine):
        result = engine.resolve_conditionals(
            "{{#if title}}{{title}}{{else}}No title{{/if}}",
            {"title": None},
        )
        assert result == "No title"

    def test_no_else_branch(self, engine):
        result = engine.resolve_conditionals(
            "Before {{#if name}}Hello {{name}}{{/if}} After",
            {"name": ""},
        )
        assert "Hello" not in result

    def test_truthy_with_else_branch(self, engine):
        result = engine.resolve_conditionals(
            "{{#if name}}Hello {{name}}{{else}}Hi stranger{{/if}}",
            {"name": "Alice"},
        )
        assert result == "Hello {{name}}"


# ---------------------------------------------------------------------------
# Merge tag resolution
# ---------------------------------------------------------------------------

class TestMergeTags:

    def test_simple_replacement(self, engine):
        result = engine.resolve_merge_tags("Hello {{first_name}}", {"first_name": "Bob"})
        assert result == "Hello Bob"

    def test_fallback_used(self, engine):
        result = engine.resolve_merge_tags('Hello {{first_name|"there"}}', {})
        assert result == "Hello there"

    def test_fallback_not_used_when_value_present(self, engine):
        result = engine.resolve_merge_tags('Hello {{first_name|"there"}}', {"first_name": "Alice"})
        assert result == "Hello Alice"

    def test_missing_variable_no_fallback(self, engine):
        result = engine.resolve_merge_tags("Hello {{first_name}}", {})
        assert result == "Hello "

    def test_multiple_variables(self, engine):
        result = engine.resolve_merge_tags(
            "{{first_name}} {{last_name}} at {{company}}",
            {"first_name": "John", "last_name": "Doe", "company": "Acme"},
        )
        assert result == "John Doe at Acme"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class TestValidation:

    def test_valid_template(self, engine):
        errors = engine.validate("Hello {{first_name}}, welcome to {{company}}!")
        assert errors == []

    def test_unbalanced_conditionals(self, engine):
        errors = engine.validate("{{#if name}}Hello{{#if other}}nested{{/if}}")
        # Should flag unbalanced or nested
        assert len(errors) > 0

    def test_nested_conditionals_error(self, engine):
        errors = engine.validate("{{#if a}}{{#if b}}nested{{/if}}{{/if}}")
        assert any("nested" in e.lower() or "Nested" in e for e in errors)

    def test_valid_with_fallback(self, engine):
        errors = engine.validate('Hi {{name|"friend"}}')
        assert errors == []

    def test_valid_with_conditionals(self, engine):
        errors = engine.validate("{{#if company}}At {{company}}{{else}}Hi{{/if}}")
        assert errors == []

    def test_invalid_tag_syntax(self, engine):
        errors = engine.validate("Hello {{invalid tag with spaces}}")
        assert len(errors) > 0


# ---------------------------------------------------------------------------
# Full render pipeline
# ---------------------------------------------------------------------------

class TestFullRender:

    def test_complete_pipeline(self, engine):
        template = '{Hey|Hello} {{first_name}}, {{#if company}}I noticed you work at {{company}}.{{else}}Nice to meet you.{{/if}}'
        result = engine.render(template, {
            "first_name": "Alice",
            "company": "Acme",
            "email": "alice@acme.com",
        })
        assert "Alice" in result
        assert "Acme" in result
        assert result.startswith("Hey") or result.startswith("Hello")

    def test_render_with_custom_fields(self, engine):
        """custom_fields dict should be flattened into top-level variables."""
        result = engine.render(
            "{{first_name}} — {{team_size}} people",
            {
                "first_name": "Bob",
                "email": "bob@test.com",
                "custom_fields": {"team_size": "50"},
            },
        )
        assert "Bob" in result
        assert "50" in result

    def test_render_cleanup_unresolved(self, engine):
        """Unresolved variables should be removed in the final output."""
        result = engine.render("Hello {{unknown_var}}, bye.", {"email": "x@y.com"})
        assert "{{unknown_var}}" not in result
        assert "Hello" in result

    def test_render_deterministic(self, engine):
        """Same input → same output with same seed."""
        template = "{A|B|C} {{name}}"
        data = {"name": "Test", "email": "test@test.com"}
        r1 = engine.render(template, data, seed=100)
        r2 = engine.render(template, data, seed=100)
        assert r1 == r2

    def test_render_subject_and_body(self, engine):
        s, b = engine.render_subject_and_body(
            "Hello {{first_name}}",
            "Welcome to {{company}}!",
            {"first_name": "Alice", "company": "Acme", "email": "alice@acme.com"},
        )
        assert s == "Hello Alice"
        assert b == "Welcome to Acme!"

    def test_render_empty_data(self, engine):
        """Render with no lead data — all variables become empty (cleaned up)."""
        result = engine.render("Hi {{name}}", {"email": "x@y.com"})
        assert result == "Hi"
