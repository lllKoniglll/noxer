import json
import re
from typing import Any, Dict, List, Optional, Tuple

from app.agent.ollama_client import chat
from app.agent.tools import dataset
from app.schemas import ChartSpec, ChatMessage, TableSpec
from app.services.sqlite_store import build_connection, query_rows


SCHEMA_DESCRIPTION = """
SQLite table: transactions

Columns:
- date text: YYYYMMDD
- year integer: accounting year, e.g. 2026
- month integer: 1-12
- voucher text: voucher id, e.g. A123
- description text: voucher text
- account text: account code
- account_name text: account name from SIE
- category_id text: friendly category id
- category_label text: friendly Swedish category
- kind text: 'income' or 'cost'
- amount real: positive analysis amount. Income is positive revenue. Cost is positive cost.
- raw_amount real: original SIE amount
- transaction_text text: transaction row text
- source_file text
- search_text text: lowercase combined searchable text
- search_acronym text: acronym/initials of searchable text, so KAC can match Kronäng Arena Cup

Important domain rules:
- Use kind = 'income' for intäkter/intäktskonton/inträkt/itäkter/inkomst.
- Use kind = 'cost' for kostnader/kostander/utgifter.
- If user asks for both intäkter and utgifter, do not filter kind; include kind/Typ in result.
- "i år" means latest year in data, normally 2026.
- If comparing 2025 and 2026, use 2026 as current and 2025 as previous.
- KAC usually means search_acronym like '%kac%' or account_name/search_text matching Kronäng Arena Cup.
- herralget/herr laget/herrlaget means herr.
- damernas/damer/damlaget means dam.
- planhyra/planyhyra/planhyror means planhyr.
- Always parenthesize OR search clauses, e.g. kind = 'cost' AND (search_text LIKE '%dam%' OR account_name LIKE '%Dam%').
- Do not use strftime('now'), current date, or date >= filters unless the user explicitly asks for today's date.
- If user asks "under 2026", filter year = 2026.
- If user does not give a year, prefer the latest year for "i år" questions, otherwise include all relevant years for overview tables.
- For table questions, return a compact grouped table unless user asks for alla rader.
- If the current user question is a short follow-up like "visa som diagram", "gör diagram", or "visa tabell", preserve the latest relevant filters, year, grouping, and search term from the recent conversation context.
- If the previous request was månadsvis/monthly and the current request asks for diagram, keep GROUP BY month and SELECT month plus SUM(amount).
- For "månadsvis" or "per månad", SELECT month AS 'Månad', SUM(amount) AS 'Belopp', COUNT(*) AS 'Rader', GROUP BY month, ORDER BY month.
- For "alla rader", "enskilda rader", "transaktioner", or "verifikationer", return transaction rows and ALWAYS include date AS 'Datum' as the first selected column, plus voucher, account, account_name, description, amount.
- For any row-level table, the result must include a visible Datum/date column.
- Always include LIMIT 100 or less.
"""


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    stripped = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", stripped, flags=re.DOTALL)
    if fenced:
        stripped = fenced.group(1)
    else:
        match = re.search(r"\{.*\}", stripped, flags=re.DOTALL)
        if match:
            stripped = match.group(0)
    try:
        parsed = json.loads(stripped, strict=False)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _is_chart_request(message: str) -> bool:
    lower = message.lower()
    return any(word in lower for word in ["diagram", "graf", "plot", "chart"])


def _is_row_level_request(message: str) -> bool:
    lower = message.lower()
    return any(word in lower for word in ["alla rader", "enskilda rader", "rader", "raader", "transaktioner", "verifikationer"])


def _has_date_column(rows: List[Dict[str, Any]]) -> bool:
    if not rows:
        return True
    return any(column.lower() in {"datum", "date"} for column in rows[0].keys())


def _chart_from_rows(title: str, rows: List[Dict[str, Any]]) -> Optional[ChartSpec]:
    if not rows:
        return None
    columns = list(rows[0].keys())
    numeric_columns = [column for column in columns if any(isinstance(row.get(column), (int, float)) for row in rows)]
    preferred_label_names = {"månad", "manad", "month", "år", "ar", "year", "konto", "kontonamn", "kategori", "datum"}
    label_columns = [
        column
        for column in columns
        if column not in numeric_columns or column.lower() in preferred_label_names
    ]
    if not numeric_columns:
        return None
    x_column = label_columns[0] if label_columns else columns[0]
    y_candidates = [
        column
        for column in numeric_columns
        if column != x_column and column.lower() not in {"månad", "manad", "month", "år", "ar", "year", "rader", "antal", "count", "transaktioner"}
    ]
    y_column = y_candidates[0] if y_candidates else next((column for column in numeric_columns if column != x_column), numeric_columns[0])
    return ChartSpec(
        title=title,
        plotly={
            "data": [
                {
                    "type": "bar",
                    "name": y_column,
                    "x": [str(row.get(x_column, "")) for row in rows],
                    "y": [float(row.get(y_column) or 0) for row in rows],
                    "marker": {"color": "#0e7a4f"},
                }
            ],
            "layout": {
                "margin": {"t": 36, "r": 18, "b": 38, "l": 58},
                "paper_bgcolor": "#ffffff",
                "plot_bgcolor": "#ffffff",
                "yaxis": {"title": y_column},
            },
            "config": {"displayModeBar": True, "responsive": True},
        },
    )


def _format_tkr(value: float) -> str:
    return f"{round(value / 1000):,}".replace(",", " ") + " tkr"


def _summarize_rows(title: str, rows: List[Dict[str, Any]]) -> str:
    if not rows:
        return f"Jag hittade inga rader för {title.lower()}."
    amount_key = next((key for key in rows[0].keys() if key.lower() in {"belopp", "amount", "summa", "skillnad"}), None)
    if amount_key:
        total = sum(float(row.get(amount_key) or 0) for row in rows if isinstance(row.get(amount_key), (int, float)))
        return f"{title}: {len(rows)} rader, totalt {_format_tkr(total)}."
    return f"{title}: {len(rows)} rader."


def answer_with_sql_agent(message: str, history: List[ChatMessage], sie_dir) -> Optional[Tuple[str, Dict[str, Any], Optional[ChartSpec], Optional[TableSpec]]]:
    # Use the request-scoped uploaded dataset when available. Previously this
    # always loaded SIE_DIR, so chat could ignore the files selected in the UI.
    data = dataset()
    recent_context = "\n".join(f"{item.role}: {item.content}" for item in history[-6:])
    system = (
        "Du är en SQL-analytiker för Kronängs IF. "
        "Din uppgift är att omvandla användarens svenska fråga till exakt en säker SQLite SELECT-fråga. "
        "Svara bara med JSON och inget annat. JSON-format: "
        '{"title":"kort svensk titel","sql":"SELECT ... LIMIT 100","notes":"kort tolkning"}. '
        "SQL-värdet måste vara en rad utan radbrytningar. "
        "Använd bara tabellen transactions. Skapa aldrig INSERT/UPDATE/DELETE/DDL. "
        "Använd svenska kolumnalias i SELECT när det passar."
    )
    user = (
        f"{SCHEMA_DESCRIPTION}\n\n"
        f"Senaste samtalskontext:\n{recent_context or '(ingen)'}\n\n"
        f"Fråga: {message}\n\n"
        "Om frågan är en uppföljning, använd senaste relevanta användarfrågan som kontext. "
        "Om svaret ska vara diagram, skapa SQL med samma gruppering som tabellen borde ha haft. "
        "Om frågan ber om enskilda rader måste Datum finnas i SELECT.\n\n"
        "Returnera JSON nu."
    )
    content = chat([{"role": "system", "content": system}, {"role": "user", "content": user}])
    if not content:
        return None
    parsed = _extract_json(content)
    if not parsed:
        return None
    sql = parsed.get("sql")
    title = parsed.get("title") or "SQL-resultat"
    if not isinstance(sql, str) or not isinstance(title, str):
        return None
    try:
        connection = build_connection(data)
        rows = query_rows(connection, sql)
    except Exception as exc:
        return (
            f"Jag försökte skapa en SQL-fråga, men den kunde inte köras: {type(exc).__name__}.",
            {"sql": sql, "error": str(exc)},
            None,
            None,
        )
    if _is_row_level_request(message) and not _has_date_column(rows):
        return None

    table = None if _is_chart_request(message) else TableSpec(title=title, columns=list(rows[0].keys()) if rows else [], rows=rows)
    chart = _chart_from_rows(title, rows) if _is_chart_request(message) else None
    answer = str(parsed.get("notes") or _summarize_rows(title, rows))
    return answer, {"sql": sql, "title": title, "row_count": len(rows)}, chart, table
