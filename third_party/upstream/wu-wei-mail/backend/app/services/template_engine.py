"""
Template Engine — THE CORE of Wu Wei Mail.

5-layer template resolution pipeline:
1. Spintax resolution      {option1|option2|option3}
2. Conditional blocks       {{#if var}}...{{else}}...{{/if}}
3. Merge tag resolution     {{var}} and {{var|"fallback"}}
4. Nested re-resolution     (handles spintax inside conditionals, etc.)
5. Cleanup                  (remove unresolved tags, trim whitespace)
"""

import re
import hashlib
import random
from typing import Optional


class TemplateEngine:
    """Full template rendering engine with spintax, conditionals, and merge tags."""

    # Patterns
    SPINTAX_PATTERN = re.compile(r"\{([^{}]*\|[^{}]*)\}")
    MERGE_TAG_PATTERN = re.compile(r"\{\{(\w+)(?:\|\"([^\"]*)\")?\}\}")
    CONDITIONAL_PATTERN = re.compile(
        r"\{\{#if\s+(\w+)\}\}(.*?)(?:\{\{else\}\}(.*?))?\{\{/if\}\}",
        re.DOTALL,
    )
    VARIABLE_PATTERN = re.compile(r"\{\{(\w+)(?:\|\"[^\"]*\")?\}\}")

    # ── Validation ──────────────────────────────────────────────────

    def validate(self, template: str) -> list[str]:
        """Validate template syntax. Returns list of errors (empty = valid)."""
        errors: list[str] = []

        # Check balanced spintax braces
        # Simple check: single braces with pipes should resolve
        for match in re.finditer(r"\{([^{}]*)\}", template):
            inner = match.group(1)
            if "|" not in inner:
                # Not spintax, might be a stray brace — warn only if not a merge tag context
                pass

        # Check balanced conditionals
        opens = len(re.findall(r"\{\{#if\s+\w+\}\}", template))
        closes = len(re.findall(r"\{\{/if\}\}", template))
        if opens != closes:
            errors.append(f"Unbalanced conditionals: {opens} {{{{#if}}}} vs {closes} {{{{/if}}}}")

        # Check for nested conditionals (not supported)
        for match in self.CONDITIONAL_PATTERN.finditer(template):
            inner = match.group(2)
            if "{{#if" in inner:
                errors.append("Nested conditionals are not supported")
                break

        # Check merge tag syntax
        for match in re.finditer(r"\{\{[^}]*\}\}", template):
            tag = match.group(0)
            if not (
                self.MERGE_TAG_PATTERN.match(tag)
                or re.match(r"\{\{#if\s+\w+\}\}", tag)
                or re.match(r"\{\{else\}\}", tag)
                or re.match(r"\{\{/if\}\}", tag)
            ):
                errors.append(f"Invalid tag syntax: {tag}")

        return errors

    # ── Variable extraction ─────────────────────────────────────────

    def extract_variables(self, template: str) -> list[str]:
        """Extract all unique variable names from merge tags and conditionals."""
        variables = set()

        # From merge tags
        for match in self.VARIABLE_PATTERN.finditer(template):
            variables.add(match.group(1))

        # From conditionals
        for match in re.finditer(r"\{\{#if\s+(\w+)\}\}", template):
            variables.add(match.group(1))

        return sorted(variables)

    # ── Layer 1: Spintax ────────────────────────────────────────────

    def resolve_spintax(self, text: str, seed: Optional[int] = None) -> str:
        """
        Resolve {option1|option2|option3} with deterministic seed.

        Each spintax block gets its own sub-seed so multiple blocks
        in the same template can resolve differently.
        """
        rng = random.Random(seed)

        def _pick(match: re.Match) -> str:
            options = match.group(1).split("|")
            return rng.choice(options)

        # Resolve iteratively (handles nested-ish spintax)
        prev = None
        result = text
        max_iterations = 10
        i = 0
        while prev != result and i < max_iterations:
            prev = result
            result = self.SPINTAX_PATTERN.sub(_pick, result)
            i += 1

        return result

    # ── Layer 2: Conditionals ───────────────────────────────────────

    def resolve_conditionals(self, text: str, variables: dict) -> str:
        """
        Resolve {{#if var}}...{{else}}...{{/if}} blocks.

        A variable is "truthy" if it exists in the dict, is not None,
        and is not an empty string.
        """

        def _eval_condition(match: re.Match) -> str:
            var_name = match.group(1)
            true_block = match.group(2) or ""
            false_block = match.group(3) or ""

            value = variables.get(var_name)
            is_truthy = value is not None and value != "" and value is not False
            return true_block.strip() if is_truthy else false_block.strip()

        # Resolve iteratively for any remaining conditionals
        prev = None
        result = text
        max_iterations = 5
        i = 0
        while prev != result and i < max_iterations:
            prev = result
            result = self.CONDITIONAL_PATTERN.sub(_eval_condition, result)
            i += 1

        return result

    # ── Layer 3: Merge tags ─────────────────────────────────────────

    def resolve_merge_tags(self, text: str, variables: dict) -> str:
        """
        Resolve {{var}} and {{var|"fallback"}} tags.

        - {{first_name}} → value of first_name or empty string
        - {{first_name|"there"}} → value of first_name or "there"
        """

        def _replace(match: re.Match) -> str:
            var_name = match.group(1)
            fallback = match.group(2)  # None if no fallback specified

            value = variables.get(var_name)
            if value is not None and value != "":
                return str(value)
            if fallback is not None:
                return fallback
            return ""

        return self.MERGE_TAG_PATTERN.sub(_replace, text)

    # ── Layer 4 & 5: Full render pipeline ───────────────────────────

    def render(
        self,
        template: str,
        lead_data: dict,
        seed: Optional[int] = None,
    ) -> str:
        """
        Full 5-layer rendering pipeline:
          1. Spintax resolution (with deterministic seed)
          2. Conditional blocks
          3. Merge tag resolution
          4. Second pass (resolve any tags that were inside conditionals)
          5. Cleanup
        """
        if seed is None:
            # Generate deterministic seed from template + lead email for consistency
            seed_str = template[:50] + lead_data.get("email", "")
            seed = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)

        # Normalize lead data: flatten custom_fields into top-level
        variables = {}
        for k, v in lead_data.items():
            if k == "custom_fields" and isinstance(v, dict):
                variables.update(v)
            else:
                variables[k] = v

        # Layer 1: Spintax
        result = self.resolve_spintax(template, seed=seed)

        # Layer 2: Conditionals
        result = self.resolve_conditionals(result, variables)

        # Layer 3: Merge tags
        result = self.resolve_merge_tags(result, variables)

        # Layer 4: Second pass (catch any tags that were inside conditional blocks)
        result = self.resolve_spintax(result, seed=seed + 1)
        result = self.resolve_merge_tags(result, variables)

        # Layer 5: Cleanup — remove any leftover unresolved tags
        result = re.sub(r"\{\{\w+(?:\|\"[^\"]*\")?\}\}", "", result)

        # Clean up extra whitespace
        result = re.sub(r"\n{3,}", "\n\n", result)
        result = result.strip()

        return result

    def render_subject_and_body(
        self,
        subject: str,
        body: str,
        lead_data: dict,
        seed: Optional[int] = None,
    ) -> tuple[str, str]:
        """Render both subject and body with the same seed for consistency."""
        if seed is None:
            seed_str = subject[:30] + lead_data.get("email", "")
            seed = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)

        rendered_subject = self.render(subject, lead_data, seed=seed)
        rendered_body = self.render(body, lead_data, seed=seed + 1000)
        return rendered_subject, rendered_body


# Singleton
template_engine = TemplateEngine()
