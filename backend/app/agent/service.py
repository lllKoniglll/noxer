import json
import re
from typing import Any, Dict, List, Optional, Tuple

from app.agent.ollama_client import chat
from app.agent.tools import (
    TOOL_DEFINITIONS,
    get_category_changes,
    get_largest_income_or_expense,
    make_monthly_plot,
)
from app.schemas import ChartSpec, ChatMessage, ChatResponse, ToolCall


MONTHS = {
    "jan": 1,
    "januari": 1,
    "feb": 2,
    "februari": 2,
    "mar": 3,
    "mars": 3,
    "apr": 4,
    "april": 4,
    "maj": 5,
    "jun": 6,
    "juni": 6,
    "jul": 7,
    "juli": 7,
    "aug": 8,
    "augusti": 8,
    "sep": 9,
    "september": 9,
    "okt": 10,
    "oktober": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def extract_year(text: str) -> Optional[int]:
    match = re.search(r"\b(20\d{2})\b", text)
    return int(match.group(1)) if match else None


def extract_month(text: str) -> Optional[int]:
    lower = text.lower()
    for name, month in MONTHS.items():
        if re.search(rf"\b{name}\b", lower):
            return month
    numeric = re.search(r"\bmånad\s+(\d{1,2})\b", lower)
    if numeric:
        month = int(numeric.group(1))
        return month if 1 <= month <= 12 else None
    return None


def deterministic_plan(message: str) -> Tuple[str, Dict[str, Any]]:
    lower = message.lower()
    year = extract_year(message)

    if any(word in lower for word in ["diagram", "graf", "plot", "visa"]):
        return "make_monthly_plot", {"year": year, "comparison": "samePeriod"}

    month = extract_month(message)
    if month and any(word in lower for word in ["största", "storsta", "högsta", "hogsta"]):
        if any(word in lower for word in ["intäkt", "intakt", "inkomst"]):
            return "get_largest_income_or_expense", {"year": year, "month": month, "kind": "income"}
        return "get_largest_income_or_expense", {"year": year, "month": month, "kind": "cost"}

    return "get_category_changes", {"year": year, "comparison": "samePeriod", "limit": 8}


def llm_plan(message: str, history: List[ChatMessage]) -> Optional[Tuple[str, Dict[str, Any]]]:
    system = (
        "Du är en svensk ekonomiadvisor för en idrottsförening. "
        "Välj exakt ett verktyg och svara bara med JSON: "
        '{"tool":"tool_name","args":{...}}. '
        f"Tillgängliga verktyg: {json.dumps(TOOL_DEFINITIONS, ensure_ascii=False)}"
    )
    messages = [{"role": "system", "content": system}]
    messages.extend({"role": item.role, "content": item.content} for item in history[-6:])
    messages.append({"role": "user", "content": message})
    content = chat(messages)
    if not content:
        return None
    try:
        parsed = json.loads(content.strip().strip("`"))
    except json.JSONDecodeError:
        return None
    tool = parsed.get("tool")
    args = parsed.get("args", {})
    if isinstance(tool, str) and isinstance(args, dict):
        return tool, args
    return None


def run_tool(name: str, args: Dict[str, Any]) -> Tuple[Dict[str, Any], Optional[ChartSpec]]:
    if name == "get_largest_income_or_expense":
        result = get_largest_income_or_expense(args.get("year"), int(args.get("month") or 1), args.get("kind") or "cost")
        return result, None
    if name == "make_monthly_plot":
        result = make_monthly_plot(args.get("year"), args.get("comparison") or "samePeriod")
        return {"answer": "Här är ett månadsdiagram med jämförelse mot föregående år."}, ChartSpec(**result)
    result = get_category_changes(args.get("year"), args.get("comparison") or "samePeriod", int(args.get("limit") or 8))
    return result, None


def synthesize_answer(user_message: str, result: Dict[str, Any], history: List[ChatMessage]) -> Tuple[str, str]:
    baseline = str(result.get("answer", "Jag har tagit fram underlaget."))
    messages = [
        {
            "role": "system",
            "content": (
                "Du är en kortfattad svensk ekonomiadvisor för Kronängs IF. "
                "Svara i klartext för styrelsen. Nämn bara siffror som finns i tool-resultatet."
            ),
        },
        {"role": "user", "content": f"Fråga: {user_message}\nTool-resultat: {json.dumps(result, ensure_ascii=False)}"},
    ]
    content = chat(messages)
    return (content.strip(), "ollama") if content else (baseline, "deterministic")


def answer_chat(message: str, history: List[ChatMessage]) -> ChatResponse:
    plan = llm_plan(message, history) or deterministic_plan(message)
    tool_name, args = plan
    result, chart = run_tool(tool_name, args)
    answer, source = synthesize_answer(message, result, history)
    return ChatResponse(
        answer=answer,
        tool_calls=[ToolCall(name=tool_name, args=args, result=result)],
        chart=chart,
        source=source,  # type: ignore[arg-type]
    )
