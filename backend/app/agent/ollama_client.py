import json
import os
import urllib.error
import urllib.request
from typing import Dict, List, Optional


def _request_json(url: str, payload: Dict[str, object], api_key: Optional[str]) -> Optional[Dict[str, object]]:
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def chat(messages: List[Dict[str, str]]) -> Optional[str]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    api_key = os.getenv("OLLAMA_API_KEY")
    model = os.getenv("OLLAMA_MODEL", "llama3.1:8b")

    if base_url.endswith("/v1"):
      response = _request_json(
          f"{base_url}/chat/completions",
          {"model": model, "messages": messages, "temperature": 0.1},
          api_key,
      )
      if response:
          choices = response.get("choices")
          if isinstance(choices, list) and choices:
              message = choices[0].get("message", {})
              if isinstance(message, dict):
                  return message.get("content")  # type: ignore[return-value]
      return None

    response = _request_json(
        f"{base_url}/api/chat",
        {"model": model, "messages": messages, "stream": False, "options": {"temperature": 0.1}},
        api_key,
    )
    if response:
        message = response.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            return content if isinstance(content, str) else None
    return None
