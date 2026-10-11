"""AI provider via OpenRouter — unified API for all LLM models."""

import json
import logging

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def _parse_response(raw_text: str) -> dict:
    """Parse AI response JSON, with fallback for non-JSON output."""
    text = raw_text.strip()

    # Try direct JSON parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON block in markdown code fences
    if "```" in text:
        for block in text.split("```"):
            block = block.strip()
            if block.startswith("json"):
                block = block[4:].strip()
            try:
                return json.loads(block)
            except json.JSONDecodeError:
                continue

    # Fallback: treat entire response as body text
    return {
        "body": text,
        "confidence": 0.5,
        "intent": "other",
    }


async def generate_response(api_key: str, model: str, system_prompt: str, user_prompt: str) -> dict:
    """Generate a response via OpenRouter.

    All models (OpenAI, Anthropic, etc.) are accessed through OpenRouter's
    unified OpenAI-compatible API.

    Returns:
        dict with keys: body (str), confidence (float), intent (str),
        prompt_tokens (int), completion_tokens (int)
    """
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=OPENROUTER_BASE_URL,
    )

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=1000,
    )

    choice = response.choices[0]
    parsed = _parse_response(choice.message.content or "")

    return {
        "body": parsed.get("body", ""),
        "confidence": float(parsed.get("confidence", 0.5)),
        "intent": parsed.get("intent", "other"),
        "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
        "completion_tokens": response.usage.completion_tokens if response.usage else 0,
    }
