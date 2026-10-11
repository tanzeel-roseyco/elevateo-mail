"""OpenRouter API client for LLM chat completions.

Uses httpx for async HTTP calls to the OpenRouter API.
Configuration is loaded from app settings (env vars).
Includes retry with exponential backoff for transient errors.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

import json as json_module
from collections.abc import AsyncIterator

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# Retry config
MAX_RETRIES = 3
RETRY_BASE_DELAY = 1.0  # seconds
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


async def _post_with_retry(
    payload: dict[str, Any],
    headers: dict[str, str],
    timeout: httpx.Timeout,
    url: str,
    label: str = "OpenRouter",
) -> dict[str, Any]:
    """POST to OpenRouter with retry on transient errors.

    Returns the parsed JSON response body.
    """
    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, json=payload, headers=headers)
                status_code: int | None
                try:
                    status_code = int(getattr(resp, "status_code", None))
                except (TypeError, ValueError):
                    status_code = None

                if status_code in RETRYABLE_STATUS_CODES and attempt < MAX_RETRIES:
                    delay = RETRY_BASE_DELAY * (2 ** attempt) + random.uniform(0, 0.5)
                    logger.warning(
                        "%s %d, retrying in %.1fs (attempt %d/%d)",
                        label, status_code, delay, attempt + 1, MAX_RETRIES,
                    )
                    await asyncio.sleep(delay)
                    continue

                if status_code is not None and status_code >= 400:
                    # Log response body for non-retryable errors (especially 400)
                    try:
                        error_body = resp.json()
                    except Exception:
                        error_body = resp.text[:500]
                    logger.error(
                        "%s %d error (model=%s): %s",
                        label, status_code, payload.get("model", "?"), error_body,
                    )
                resp.raise_for_status()
                return resp.json()

        except (httpx.TimeoutException, httpx.ConnectError) as e:
            last_error = e
            if attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt) + random.uniform(0, 0.5)
                logger.warning(
                    "%s timeout/connect error, retrying in %.1fs (attempt %d/%d)",
                    label, delay, attempt + 1, MAX_RETRIES,
                )
                await asyncio.sleep(delay)
            else:
                raise

    raise last_error or RuntimeError(f"{label} failed after retries")


async def chat_completion(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    api_key: str | None = None,
) -> str:
    """Send a chat completion request to OpenRouter and return the response text.

    Retries up to MAX_RETRIES times on transient errors (429, 5xx, timeouts).

    Args:
        messages: List of {"role": "system"|"user"|"assistant", "content": "..."} dicts.
        model: Override model (defaults to settings.OPENROUTER_MODEL).
        temperature: Override temperature (defaults to settings.OPENROUTER_TEMPERATURE).
        max_tokens: Override max_tokens (defaults to settings.OPENROUTER_MAX_TOKENS).

    Returns:
        The assistant's response text.

    Raises:
        httpx.HTTPStatusError: On non-2xx response after retries.
        ValueError: If the API returns an unexpected shape.
    """
    settings = get_settings()
    resolved_api_key = api_key or settings.OPENROUTER_API_KEY
    if not resolved_api_key:
        raise ValueError("OPENROUTER_API_KEY is not configured")

    payload: dict[str, Any] = {
        "model": model or settings.OPENROUTER_MODEL,
        "messages": messages,
        "temperature": temperature if temperature is not None else settings.OPENROUTER_TEMPERATURE,
        "max_tokens": max_tokens or settings.OPENROUTER_MAX_TOKENS,
    }

    headers = {
        "Authorization": f"Bearer {resolved_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.OPENROUTER_APP_URL,
        "X-Title": settings.OPENROUTER_APP_NAME,
    }

    timeout = httpx.Timeout(
        timeout=float(settings.OPENROUTER_TIMEOUT_SECONDS),
        connect=10.0,
    )

    url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"
    logger.debug("OpenRouter request: model=%s url=%s", payload["model"], url)

    data = await _post_with_retry(payload, headers, timeout, url, label="OpenRouter")

    # Extract content from the response
    choices = data.get("choices", [])
    if not choices:
        logger.warning("OpenRouter returned no choices: %s", data)
        raise ValueError("OpenRouter returned no choices")

    content = choices[0].get("message", {}).get("content", "")
    if not content:
        raise ValueError("OpenRouter returned empty content")

    logger.debug("OpenRouter response: %d chars", len(content))
    return content


async def extract_json(
    prompt: str,
    user_content: str,
    *,
    model: str | None = None,
    max_tokens: int | None = None,
    api_key: str | None = None,
) -> str:
    """Convenience wrapper that sends a system prompt + user content for JSON extraction.

    Returns raw text from the model (caller should parse JSON from it).
    Uses higher max_tokens by default (4096) to avoid truncated JSON.
    """
    return await chat_completion(
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_content},
        ],
        model=model,
        temperature=0.1,  # Low temperature for structured extraction
        max_tokens=max_tokens or 4096,
        api_key=api_key,
    )


async def chat_completion_with_tools(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Send a chat completion with tool definitions and return the full message dict.

    Retries up to MAX_RETRIES times on transient errors (429, 5xx, timeouts).

    Unlike chat_completion() which returns just the text content, this returns
    the entire assistant message dict which may contain:
    - "content": str for text responses
    - "tool_calls": list for tool invocations

    The caller is responsible for executing tool calls and sending results back.
    """
    settings = get_settings()
    resolved_api_key = api_key or settings.OPENROUTER_API_KEY
    if not resolved_api_key:
        raise ValueError("OPENROUTER_API_KEY is not configured")

    payload: dict[str, Any] = {
        "model": model or settings.OPENROUTER_MODEL,
        "messages": messages,
        "tools": tools,
        "temperature": temperature if temperature is not None else settings.OPENROUTER_TEMPERATURE,
        "max_tokens": max_tokens or settings.OPENROUTER_MAX_TOKENS,
    }

    headers = {
        "Authorization": f"Bearer {resolved_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.OPENROUTER_APP_URL,
        "X-Title": settings.OPENROUTER_APP_NAME,
    }

    timeout = httpx.Timeout(
        timeout=float(settings.OPENROUTER_TIMEOUT_SECONDS),
        connect=10.0,
    )

    url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"
    logger.debug(
        "OpenRouter tool request: model=%s tools=%d",
        payload["model"], len(tools),
    )

    data = await _post_with_retry(payload, headers, timeout, url, label="OpenRouter tools")

    choices = data.get("choices", [])
    if not choices:
        logger.warning("OpenRouter returned no choices: %s", data)
        raise ValueError("OpenRouter returned no choices")

    message = choices[0].get("message", {})
    # Attach usage data for telemetry (consumed by agent_loop)
    usage = data.get("usage")
    if usage:
        message["_usage"] = usage
    logger.debug(
        "OpenRouter tool response: has_content=%s has_tool_calls=%s",
        bool(message.get("content")),
        bool(message.get("tool_calls")),
    )
    return message


async def chat_completion_streaming(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    api_key: str | None = None,
) -> AsyncIterator[str]:
    """Stream a chat completion response, yielding text deltas as they arrive.

    Uses OpenRouter's SSE streaming (stream=true). Yields individual text
    chunks as they arrive — the caller is responsible for concatenation.

    No retry logic here: streaming connections are long-lived and retrying
    mid-stream would produce duplicate content.
    """
    settings = get_settings()
    resolved_api_key = api_key or settings.OPENROUTER_API_KEY
    if not resolved_api_key:
        raise ValueError("OPENROUTER_API_KEY is not configured")

    payload: dict[str, Any] = {
        "model": model or settings.OPENROUTER_MODEL,
        "messages": messages,
        "temperature": temperature if temperature is not None else settings.OPENROUTER_TEMPERATURE,
        "max_tokens": max_tokens or settings.OPENROUTER_MAX_TOKENS,
        "stream": True,
    }

    headers = {
        "Authorization": f"Bearer {resolved_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.OPENROUTER_APP_URL,
        "X-Title": settings.OPENROUTER_APP_NAME,
    }

    timeout = httpx.Timeout(
        timeout=float(settings.OPENROUTER_TIMEOUT_SECONDS),
        connect=10.0,
    )

    url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"
    logger.debug("OpenRouter streaming request: model=%s", payload["model"])

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            resp.raise_for_status()

            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue

                data_str = line[6:]  # strip "data: " prefix
                if data_str.strip() == "[DONE]":
                    break

                try:
                    chunk = json_module.loads(data_str)
                except json_module.JSONDecodeError:
                    continue

                delta = (
                    chunk.get("choices", [{}])[0]
                    .get("delta", {})
                    .get("content", "")
                )
                if delta:
                    yield delta
