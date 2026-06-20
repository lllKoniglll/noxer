import json
import re
from typing import Any, Dict, List, Optional, Tuple

from app.agent.ollama_client import chat
from app.agent.tools import (
    TOOL_DEFINITIONS,
    analyze_category_over_time,
    analyze_metric_changes,
    analyze_query_totals,
    compare_query_table,
    get_category_changes,
    get_largest_income_or_expense,
    list_accounts_for_query,
    make_difference_plot,
    make_monthly_plot,
    transaction_rows_table,
    yearly_query_table,
)
from app.schemas import ChartSpec, ChatMessage, ChatResponse, TableSpec, ToolCall


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


def extract_category_query(text: str) -> Optional[str]:
    lower = text.lower()
    category_terms = [
        "personal",
        "arvode",
        "arvoden",
        "lön",
        "löner",
        "lon",
        "loner",
        "lokal",
        "hyra",
        "plan",
        "arena",
        "it",
        "bank",
        "admin",
        "administration",
        "kiosk",
        "cafe",
        "café",
        "försäljning",
        "forsaljning",
        "bidrag",
        "sponsor",
        "medlem",
        "avgift",
        "träning",
        "traning",
        "cup",
        "cuper",
        "arrangemang",
        "domare",
        "licens",
        "fotboll",
    ]
    for term in category_terms:
        if re.search(rf"\b{re.escape(term)}", lower):
            return term
    quoted = re.search(r'"([^"]+)"', text)
    return quoted.group(1) if quoted else None


def clean_query_target(candidate: str) -> Optional[str]:
    value = candidate.strip(" ?.,:;")
    value = re.sub(r"\b(i år|i ar|under\s+20\d{2}|över åren|over aren|i en tabell|som tabell|tabell|diagram)\b", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\b(intäkt|intäkter|intakt|intakter|inträkt|inträkter|itäkt|itäkter|kostnad|kostnader|utgift|utgifter|konton|konto|alla|rader|visa|ge mig|för|från)\b", "", value, flags=re.IGNORECASE)
    value = " ".join(value.split()).strip(" ?.,:;")
    lower = value.lower()
    if "planyhyr" in lower or "planhyr" in lower or "planhyra" in lower:
        return "planhyr"
    if "damlag" in lower or "damlaget" in lower:
        return "dam"
    if "herrlag" in lower or "herrlaget" in lower:
        return "herr"
    return value or None


def extract_query_target(text: str) -> Optional[str]:
    quoted = re.search(r'"([^"]+)"', text)
    if quoted:
        return clean_query_target(quoted.group(1).strip())

    upper_tokens = re.findall(r"\b[A-ZÅÄÖ]{2,}\b", text)
    ignored = {"HUR", "VAD", "VISA", "SEK", "TKR"}
    for token in upper_tokens:
        if token not in ignored:
            return token

    if re.search(r"\bplanhyr", text, flags=re.IGNORECASE):
        return "planhyr"
    if re.search(r"\bplanyhyr", text, flags=re.IGNORECASE):
        return "planhyr"
    if re.search(r"\blokalhyr", text, flags=re.IGNORECASE):
        return "lokalhyr"
    if re.search(r"\bdamlaget?\b", text, flags=re.IGNORECASE):
        return "dam"

    metric_target = re.search(
        r"\b(?:intäkt|intäkter|intakt|intakter|inträkt|inträkter|itäkt|itäkter|kostnad|kostnader|utgift|utgifter)\s+(?:för|från|mot)\s+(.+?)(?:$|\s+i år|\s+i ar|\s+under|\s+över åren|\s+over aren|\s+i en tabell|\s+som tabell|\s+diagram)",
        text,
        flags=re.IGNORECASE,
    )
    if metric_target:
        target = clean_query_target(metric_target.group(1))
        if target:
            return target

    subject_target = re.search(r"\bvad har\s+(.+?)\s+haft\s+för\s+(?:kostnad|kostnader|utgift|utgifter|intäkt|intäkter)", text, flags=re.IGNORECASE)
    if subject_target:
        target = clean_query_target(subject_target.group(1))
        if target:
            return target

    match = re.search(
        r"\b(?:för|från|mot|gällande|kring|över)\s+([A-Za-zÅÄÖåäö0-9][A-Za-zÅÄÖåäö0-9 ._-]{1,60})",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return clean_query_target(match.group(1))


def previous_query_target(history: List[ChatMessage]) -> Optional[str]:
    for item in reversed(history[-8:]):
        if item.role != "user":
            continue
        target = extract_query_target(item.content)
        if target:
            return target
    return None


def deterministic_plan(message: str, history: List[ChatMessage]) -> Tuple[str, Dict[str, Any]]:
    lower = message.lower()
    year = extract_year(message)
    category_query = extract_category_query(message)
    query_target = extract_query_target(message)
    wants_difference = any(word in lower for word in ["skillnad", "skillnader", "skiljer", "avvikelse", "avvikelser", "jämför", "jamfor"])
    wants_change = any(word in lower for word in ["ökning", "okning", "minskning", "ökat", "okat", "minskat", "största ökningen", "största minskningen"])
    wants_chart = any(word in lower for word in ["diagram", "graf", "plot", "visa", "fördelat", "fordelat", "över året", "over aret"])
    wants_table = any(word in lower for word in ["tabell", "lista", "alla", "konton", "konto", "rader", "raader", "specifikation", "specificera", "över åren", "over aren"])
    wants_rows = any(word in lower for word in ["rader", "raader", "alla rader"])
    wants_yearly = any(word in lower for word in ["över åren", "over aren", "per år", "per ar"])
    mentions_income = any(word in lower for word in ["intäkt", "intakt", "intäkter", "intakter", "inträkt", "inträkter", "itäkt", "itäkter", "inkomst"])
    mentions_cost = any(word in lower for word in ["kostnad", "kostnader", "utgift", "utgifter"])

    if not query_target and (wants_table or wants_rows):
        query_target = previous_query_target(history)

    if query_target and wants_yearly:
        return "yearly_query_table", {
            "query": query_target,
            "kind": "income" if mentions_income else "cost" if mentions_cost else None,
        }

    if query_target and wants_rows:
        return "transaction_rows_table", {
            "query": query_target,
            "year": year,
            "kind": "income" if mentions_income else "cost" if mentions_cost else None,
            "limit": 100,
        }

    if query_target and wants_table:
        return "list_accounts_for_query", {
            "query": query_target,
            "year": year,
            "kind": "income" if mentions_income else "cost" if mentions_cost else None,
        }

    if query_target and wants_difference:
        return "compare_query_table", {
            "query": query_target,
            "year": year,
            "kind": "income" if mentions_income else "cost" if mentions_cost else None,
        }

    if query_target and (mentions_income or mentions_cost):
        return "analyze_query_totals", {
            "query": query_target,
            "year": year,
            "comparison": "samePeriod",
            "kind": "income" if mentions_income else "cost",
        }

    if (mentions_income or mentions_cost) and (wants_change or wants_difference):
        return "analyze_metric_changes", {
            "year": year,
            "comparison": "samePeriod",
            "metric": "income" if mentions_income else "cost",
        }

    if (mentions_income or mentions_cost) and (year or "i år" in lower or "i ar" in lower or "under" in lower):
        return "analyze_metric_changes", {
            "year": year,
            "comparison": "samePeriod",
            "metric": "income" if mentions_income else "cost",
        }

    if category_query and (
        wants_chart
        or wants_difference
        or any(word in lower for word in ["ökat", "okat", "dyrare", "billigare", "dragit", "förändrats", "forandrats", "analys", "analysera"])
    ):
        return "analyze_category_over_time", {
            "category_query": category_query,
            "year": year,
            "comparison": "samePeriod",
            "chart": "difference" if wants_difference else "monthly",
        }

    if wants_difference and wants_chart:
        if mentions_income:
            metric = "income"
        elif mentions_cost:
            metric = "cost"
        else:
            metric = "result"
        return "make_difference_plot", {"year": year, "comparison": "samePeriod", "metric": metric}

    if wants_chart:
        return "make_monthly_plot", {"year": year, "comparison": "samePeriod"}

    month = extract_month(message)
    if month and any(word in lower for word in ["största", "storsta", "högsta", "hogsta"]):
        if mentions_income:
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


def run_tool(name: str, args: Dict[str, Any]) -> Tuple[Dict[str, Any], Optional[ChartSpec], Optional[TableSpec]]:
    if name == "get_largest_income_or_expense":
        result = get_largest_income_or_expense(args.get("year"), int(args.get("month") or 1), args.get("kind") or "cost")
        return result, None, None
    if name == "make_monthly_plot":
        result = make_monthly_plot(args.get("year"), args.get("comparison") or "samePeriod")
        return {"answer": "Här är ett månadsdiagram med jämförelse mot föregående år."}, ChartSpec(**result), None
    if name == "analyze_category_over_time":
        result = analyze_category_over_time(
            str(args.get("category_query") or ""),
            args.get("year"),
            args.get("comparison") or "samePeriod",
            args.get("chart") or "monthly",
        )
        chart = ChartSpec(**result["chart"]) if result.get("chart") else None
        return result, chart, None
    if name == "analyze_metric_changes":
        result = analyze_metric_changes(args.get("year"), args.get("comparison") or "samePeriod", args.get("metric") or "income")
        chart = ChartSpec(**result["chart"]) if result.get("chart") else None
        return result, chart, None
    if name == "analyze_query_totals":
        result = analyze_query_totals(
            str(args.get("query") or ""),
            args.get("year"),
            args.get("comparison") or "samePeriod",
            args.get("kind"),
        )
        chart = ChartSpec(**result["chart"]) if result.get("chart") else None
        return result, chart, None
    if name == "list_accounts_for_query":
        result = list_accounts_for_query(str(args.get("query") or ""), args.get("year"), args.get("kind"))
        table = TableSpec(**result["table"]) if result.get("table") else None
        return result, None, table
    if name == "compare_query_table":
        result = compare_query_table(str(args.get("query") or ""), args.get("year"), args.get("kind"))
        table = TableSpec(**result["table"]) if result.get("table") else None
        return result, None, table
    if name == "yearly_query_table":
        result = yearly_query_table(str(args.get("query") or ""), args.get("kind"))
        table = TableSpec(**result["table"]) if result.get("table") else None
        return result, None, table
    if name == "transaction_rows_table":
        result = transaction_rows_table(
            str(args.get("query") or ""),
            args.get("year"),
            args.get("kind"),
            int(args.get("limit") or 100),
        )
        table = TableSpec(**result["table"]) if result.get("table") else None
        return result, None, table
    if name == "make_difference_plot":
        result = make_difference_plot(args.get("year"), args.get("comparison") or "samePeriod", args.get("metric") or "result")
        chart = ChartSpec(**result["chart"]) if result.get("chart") else None
        return result, chart, None
    result = get_category_changes(args.get("year"), args.get("comparison") or "samePeriod", int(args.get("limit") or 8))
    return result, None, None


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
    plan = deterministic_plan(message, history)
    if plan[0] == "get_category_changes":
        plan = llm_plan(message, history) or plan
    tool_name, args = plan
    result, chart, table = run_tool(tool_name, args)
    answer, source = synthesize_answer(message, result, history)
    return ChatResponse(
        answer=answer,
        tool_calls=[ToolCall(name=tool_name, args=args, result=result)],
        chart=chart,
        table=table,
        source=source,  # type: ignore[arg-type]
    )
