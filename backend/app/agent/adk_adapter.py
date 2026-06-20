from typing import Any, Dict, List

from app.agent.tools import TOOL_DEFINITIONS


def adk_status() -> Dict[str, Any]:
    try:
        from google.adk.agents import Agent  # noqa: F401
        from google.adk.tools import FunctionTool  # noqa: F401
    except Exception as exc:
        return {"available": False, "error": f"{type(exc).__name__}: {exc}", "tools": TOOL_DEFINITIONS}

    return {
        "available": True,
        "runtime": "google-adk",
        "tools": TOOL_DEFINITIONS,
    }


def adk_tool_names() -> List[str]:
    return [tool["name"] for tool in TOOL_DEFINITIONS]
