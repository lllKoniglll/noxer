import json
import os
import urllib.error
import urllib.request
from typing import Dict, List, Optional


def _request_json(url: str, payload: Dict[str, object], api_key: Optional[str], timeout: int = 60) -> Optional[Dict[str, object]]:
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def settings() -> Dict[str, object]:
    return {
        "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/"),
        "model": os.getenv("OLLAMA_MODEL", "ministral-3:8b"),
        "api_key_configured": bool(os.getenv("OLLAMA_API_KEY")),
    }


def status() -> Dict[str, object]:
    current = settings()
    base_url = str(current["base_url"])
    api_key = os.getenv("OLLAMA_API_KEY")
    request = urllib.request.Request(f"{base_url}/api/tags", headers={"Authorization": f"Bearer {api_key}"} if api_key else {})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        return {**current, "available": False, "error": f"{type(exc).__name__}: {exc}"}
    models = [item.get("name") for item in payload.get("models", []) if isinstance(item, dict)]
    return {**current, "available": True, "models": models, "selected_model_available": current["model"] in models}


def chat(messages: List[Dict[str, str]]) -> Optional[str]:
    current = settings()
    base_url = str(current["base_url"])
    api_key = os.getenv("OLLAMA_API_KEY")
    selected_model = str(current["model"])
    models = []
    for model in [selected_model, "ministral-3:8b", "qwen3.5:latest", "llama3.1:latest"]:
        if model not in models:
            models.append(model)

    if base_url.endswith("/v1"):
        for model in models:
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
                        content = message.get("content")
                        if isinstance(content, str):
                            return content
        return None

    for model in models:
        response = _request_json(
            f"{base_url}/api/chat",
            {"model": model, "messages": messages, "stream": False, "options": {"temperature": 0.1}},
            api_key,
        )
        if response:
            message = response.get("message")
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str):
                    return content
    return None
