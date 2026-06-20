from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.reports import (
    category_monthly_report,
    category_report,
    format_tkr,
    monthly_report,
    normalize_year,
    query_monthly_report,
    transactions_for_month,
)
from app.services.sie_parser import load_dataset
from app.services.sqlite_store import build_connection, latest_year, like_pattern, query_rows


SIE_DIR = Path(__file__).resolve().parents[3] / "SIE4"


def dataset():
    return load_dataset(SIE_DIR)


def get_largest_income_or_expense(year: Optional[int], month: int, kind: str) -> Dict[str, Any]:
    data = dataset()
    selected_year = normalize_year(data, year)
    rows = transactions_for_month(data, selected_year, month, "income" if kind == "income" else "cost")
    largest = rows[0] if rows else None
    return {
        "year": selected_year,
        "month": month,
        "kind": kind,
        "largest": largest,
        "answer": (
            f"Största {'intäkten' if kind == 'income' else 'utgiften'} i månad {month} är "
            f"{format_tkr(float(largest['amount']))} på {largest['account_name']} ({largest['description']})."
            if largest
            else f"Jag hittar ingen {'intäkt' if kind == 'income' else 'utgift'} för månad {month}."
        ),
    }


def get_category_changes(year: Optional[int], comparison: str = "samePeriod", limit: int = 8) -> Dict[str, Any]:
    data = dataset()
    selected_year = normalize_year(data, year)
    rows = category_report(data, selected_year, "samePeriod" if comparison == "samePeriod" else "fullYear")
    changes: List[Dict[str, Any]] = []
    for row in rows:
        previous = float(row["previous_amount"])
        current = float(row["amount"])
        delta = current - previous
        percent = None if previous == 0 else round((delta / abs(previous)) * 100)
        changes.append(
            {
                "label": row["label"],
                "current": current,
                "previous": previous,
                "delta": delta,
                "percent": percent,
            }
        )
    changes = sorted(changes, key=lambda item: abs(float(item["delta"])), reverse=True)[:limit]
    bullets = [
        f"{item['label']}: {format_tkr(item['current'])} mot {format_tkr(item['previous'])}, "
        f"{'+' if item['delta'] >= 0 else ''}{format_tkr(item['delta'])}"
        for item in changes
    ]
    return {
        "year": selected_year,
        "comparison": comparison,
        "changes": changes,
        "answer": "Största kategoriavvikelserna är:\n" + "\n".join(f"- {bullet}" for bullet in bullets),
    }


def analyze_metric_changes(year: Optional[int], comparison: str = "samePeriod", metric: str = "income") -> Dict[str, Any]:
    data = dataset()
    selected_year = normalize_year(data, year)
    rows = monthly_report(data, selected_year, "samePeriod" if comparison == "samePeriod" else "fullYear")
    if metric == "cost":
        current_values = [row.costs for row in rows]
        previous_values = [row.previous_costs for row in rows]
        label = "Kostnader"
        good_color = "#0e7a4f"
        bad_color = "#b9412d"
    elif metric == "result":
        current_values = [row.result for row in rows]
        previous_values = [row.previous_result for row in rows]
        label = "Resultat"
        good_color = "#0e7a4f"
        bad_color = "#b9412d"
    else:
        current_values = [row.income for row in rows]
        previous_values = [row.previous_income for row in rows]
        label = "Intäkter"
        good_color = "#0e7a4f"
        bad_color = "#b9412d"

    deltas = [current - previous for current, previous in zip(current_values, previous_values)]
    total = sum(current_values)
    previous_total = sum(previous_values)
    increase = max(zip(rows, deltas, current_values, previous_values), key=lambda item: item[1], default=None)
    decrease = min(zip(rows, deltas, current_values, previous_values), key=lambda item: item[1], default=None)
    direction = "högre" if total > previous_total else "lägre" if total < previous_total else "oförändrade"
    answer = (
        f"{label} är {format_tkr(total)} {selected_year}, jämfört med {format_tkr(previous_total)} {selected_year - 1}; "
        f"det är {format_tkr(abs(total - previous_total))} {direction}. "
        f"Största ökningen är {increase[0].label} ({format_tkr(float(increase[1]))}) och "
        f"största minskningen är {decrease[0].label} ({format_tkr(float(decrease[1]))})."
        if increase and decrease
        else f"Jag hittar inte tillräckligt med data för {label.lower()}."
    )
    return {
        "year": selected_year,
        "comparison": comparison,
        "metric": metric,
        "total": total,
        "previous_total": previous_total,
        "deltas": [
            {
                "month": row.month,
                "label": row.label,
                "current": current,
                "previous": previous,
                "delta": delta,
            }
            for row, current, previous, delta in zip(rows, current_values, previous_values, deltas)
        ],
        "answer": answer,
        "chart": {
            "title": f"{label}: skillnad {selected_year} mot {selected_year - 1}",
            "plotly": {
                "data": [
                    {
                        "type": "bar",
                        "name": "Skillnad",
                        "x": [row.label for row in rows],
                        "y": [round(delta) for delta in deltas],
                        "marker": {"color": [good_color if delta >= 0 else bad_color for delta in deltas]},
                    }
                ],
                "layout": {
                    "margin": {"t": 36, "r": 18, "b": 38, "l": 58},
                    "paper_bgcolor": "#ffffff",
                    "plot_bgcolor": "#ffffff",
                    "yaxis": {"title": "SEK"},
                },
                "config": {"displayModeBar": True, "responsive": True},
            },
        },
    }


def analyze_query_totals(
    query: str,
    year: Optional[int],
    comparison: str = "samePeriod",
    kind: Optional[str] = None,
) -> Dict[str, Any]:
    data = dataset()
    selected_comparison = "samePeriod" if comparison == "samePeriod" else "fullYear"
    selected_kind = kind if kind in {"income", "cost"} else None
    report = query_monthly_report(data, query, year, selected_comparison, selected_kind)
    rows = report["rows"]
    totals = report["totals"]
    selected_year = int(report["year"])
    current_total = float(totals["amount"])
    previous_total = float(totals["previous_amount"])
    delta = current_total - previous_total
    top_accounts = report["top_accounts"]
    kind_label = "intäkter" if selected_kind == "income" else "kostnader" if selected_kind == "cost" else "utfall"

    if current_total == 0 and previous_total == 0:
        answer = f"Jag hittar inga {kind_label} som matchar '{query}' i den inlästa SIE-datan."
    else:
        direction = "högre" if delta > 0 else "lägre" if delta < 0 else "oförändrat"
        account_text = f" Största konto är {top_accounts[0]['name']} med {format_tkr(float(top_accounts[0]['amount']))}." if top_accounts else ""
        answer = (
            f"{kind_label.capitalize()} för '{query}' är {format_tkr(current_total)} {selected_year}, jämfört med "
            f"{format_tkr(previous_total)} {selected_year - 1}. Det är {format_tkr(abs(delta))} {direction}."
            f"{account_text}"
        )

    return {
        **report,
        "answer": answer,
        "chart": {
            "title": f"{kind_label.capitalize()} för {query}",
            "plotly": {
                "data": [
                    {
                        "type": "bar",
                        "name": f"{selected_year}",
                        "x": [row["label"] for row in rows],
                        "y": [round(float(row["amount"])) for row in rows],
                        "marker": {"color": "#0e7a4f" if selected_kind == "income" else "#b9412d"},
                    },
                    {
                        "type": "bar",
                        "name": f"{selected_year - 1}",
                        "x": [row["label"] for row in rows],
                        "y": [round(float(row["previous_amount"])) for row in rows],
                        "marker": {"color": "#86b89e" if selected_kind == "income" else "#d89180"},
                    },
                ],
                "layout": {
                    "barmode": "group",
                    "margin": {"t": 36, "r": 18, "b": 38, "l": 58},
                    "paper_bgcolor": "#ffffff",
                    "plot_bgcolor": "#ffffff",
                    "yaxis": {"title": "SEK"},
                },
                "config": {"displayModeBar": True, "responsive": True},
            },
        },
    }


def _table(title: str, columns: List[str], rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"title": title, "columns": columns, "rows": rows}


def list_accounts_for_query(query: str, year: Optional[int], kind: Optional[str] = "income") -> Dict[str, Any]:
    data = dataset()
    selected_year = latest_year(data, year)
    selected_kind = kind if kind in {"income", "cost"} else None
    connection = build_connection(data)
    where_kind = "and kind = ?" if selected_kind else ""
    normalized_query = query.lower().replace(" ", "")
    match_parameters = [like_pattern(query), like_pattern(query), like_pattern(query), like_pattern(query), like_pattern(normalized_query)]
    parameters: List[Any] = [selected_year, *match_parameters]
    if selected_kind:
        parameters.append(selected_kind)
    rows = query_rows(
        connection,
        f"""
        select
            account as Konto,
            account_name as Kontonamn,
            category_label as Kategori,
            round(sum(amount), 2) as Belopp,
            count(*) as Rader
        from transactions
        where year = ?
          and (
            lower(account_name) like ?
            or lower(transaction_text) like ?
            or lower(account) like ?
            or lower(category_label) like ?
            or search_acronym like ?
          )
          {where_kind}
        group by account, account_name, category_label
        having abs(sum(amount)) > 0.004
        order by abs(sum(amount)) desc
        limit 50
        """,
        parameters,
    )
    total = sum(float(row["Belopp"]) for row in rows)
    kind_label = "intäktskonton" if selected_kind == "income" else "kostnadskonton" if selected_kind == "cost" else "konton"
    answer = (
        f"Jag hittade {len(rows)} {kind_label} för '{query}' under {selected_year}, totalt {format_tkr(total)}."
        if rows
        else f"Jag hittade inga {kind_label} för '{query}' under {selected_year}."
    )
    return {
        "query": query,
        "year": selected_year,
        "kind": selected_kind,
        "answer": answer,
        "table": _table(f"{kind_label.capitalize()} för {query}", ["Konto", "Kontonamn", "Kategori", "Belopp", "Rader"], rows),
    }


def compare_query_table(query: str, year: Optional[int], kind: Optional[str] = None) -> Dict[str, Any]:
    data = dataset()
    selected_year = latest_year(data, year)
    selected_kind = kind if kind in {"income", "cost"} else None
    connection = build_connection(data)
    where_kind = "and kind = ?" if selected_kind else ""
    normalized_query = query.lower().replace(" ", "")
    match_parameters = [like_pattern(query), like_pattern(query), like_pattern(query), like_pattern(query), like_pattern(normalized_query)]
    parameters: List[Any] = [selected_year, selected_year - 1, *match_parameters]
    if selected_kind:
        parameters.append(selected_kind)
    rows = query_rows(
        connection,
        f"""
        select
            account as Konto,
            account_name as Kontonamn,
            category_label as Kategori,
            round(sum(case when year = ? then amount else 0 end), 2) as Nuvarande,
            round(sum(case when year = ? then amount else 0 end), 2) as Foregaende,
            round(
                sum(case when year = ? then amount else 0 end)
                - sum(case when year = ? then amount else 0 end),
                2
            ) as Skillnad,
            count(*) as Rader
        from transactions
        where year in (?, ?)
          and (
            lower(account_name) like ?
            or lower(transaction_text) like ?
            or lower(account) like ?
            or lower(category_label) like ?
            or search_acronym like ?
          )
          {where_kind}
        group by account, account_name, category_label
        having abs(Nuvarande) > 0.004 or abs(Foregaende) > 0.004
        order by abs(Skillnad) desc
        limit 50
        """,
        [selected_year, selected_year - 1, selected_year, selected_year - 1, *parameters],
    )
    total_current = sum(float(row["Nuvarande"]) for row in rows)
    total_previous = sum(float(row["Foregaende"]) for row in rows)
    delta = total_current - total_previous
    answer = (
        f"För '{query}' är utfallet {format_tkr(total_current)} {selected_year} mot "
        f"{format_tkr(total_previous)} {selected_year - 1}. Skillnaden är {format_tkr(delta)}."
        if rows
        else f"Jag hittade inget underlag för '{query}' att jämföra."
    )
    return {
        "query": query,
        "year": selected_year,
        "kind": selected_kind,
        "answer": answer,
        "table": _table(
            f"Skillnad för {query}",
            ["Konto", "Kontonamn", "Kategori", "Nuvarande", "Foregaende", "Skillnad", "Rader"],
            rows,
        ),
    }


def yearly_query_table(query: str, kind: Optional[str] = "income") -> Dict[str, Any]:
    data = dataset()
    selected_kind = kind if kind in {"income", "cost"} else None
    connection = build_connection(data)
    where_kind = "and kind = ?" if selected_kind else ""
    normalized_query = query.lower().replace(" ", "")
    parameters: List[Any] = [like_pattern(query), like_pattern(query), like_pattern(query), like_pattern(query), like_pattern(normalized_query)]
    if selected_kind:
        parameters.append(selected_kind)
    rows = query_rows(
        connection,
        f"""
        select
            year as Ar,
            round(sum(amount), 2) as Belopp,
            count(*) as Rader
        from transactions
        where (
            lower(account_name) like ?
            or lower(transaction_text) like ?
            or lower(account) like ?
            or lower(category_label) like ?
            or search_acronym like ?
        )
          {where_kind}
        group by year
        having abs(sum(amount)) > 0.004
        order by year
        """,
        parameters,
    )
    total = sum(float(row["Belopp"]) for row in rows)
    kind_label = "Intäkter" if selected_kind == "income" else "Kostnader" if selected_kind == "cost" else "Utfall"
    answer = (
        f"{kind_label} för '{query}' över åren summerar till {format_tkr(total)}."
        if rows
        else f"Jag hittade inget underlag för '{query}' över åren."
    )
    return {
        "query": query,
        "kind": selected_kind,
        "answer": answer,
        "table": _table(f"{kind_label} för {query} över åren", ["Ar", "Belopp", "Rader"], rows),
    }


def transaction_rows_table(query: str, year: Optional[int], kind: Optional[str] = None, limit: int = 100) -> Dict[str, Any]:
    data = dataset()
    selected_year = latest_year(data, year)
    selected_kind = kind if kind in {"income", "cost"} else None
    connection = build_connection(data)
    where_kind = "and kind = ?" if selected_kind else ""
    normalized_query = query.lower().replace(" ", "")
    parameters: List[Any] = [
        selected_year,
        like_pattern(query),
        like_pattern(query),
        like_pattern(query),
        like_pattern(query),
        like_pattern(normalized_query),
    ]
    if selected_kind:
        parameters.append(selected_kind)
    parameters.append(limit)
    rows = query_rows(
        connection,
        f"""
        select
            date as Datum,
            voucher as Ver,
            account as Konto,
            account_name as Kontonamn,
            category_label as Kategori,
            description as Text,
            round(amount, 2) as Belopp
        from transactions
        where year = ?
          and (
            lower(account_name) like ?
            or lower(transaction_text) like ?
            or lower(account) like ?
            or lower(category_label) like ?
            or search_acronym like ?
          )
          {where_kind}
        order by date, voucher, account
        limit ?
        """,
        parameters,
    )
    total = sum(float(row["Belopp"]) for row in rows)
    answer = (
        f"Jag hittade {len(rows)} rader för '{query}' under {selected_year}, totalt {format_tkr(total)}."
        if rows
        else f"Jag hittade inga rader för '{query}' under {selected_year}."
    )
    return {
        "query": query,
        "year": selected_year,
        "kind": selected_kind,
        "answer": answer,
        "table": _table(
            f"Rader för {query}",
            ["Datum", "Ver", "Konto", "Kontonamn", "Kategori", "Text", "Belopp"],
            rows,
        ),
    }


def analyze_category_over_time(
    category_query: str,
    year: Optional[int],
    comparison: str = "samePeriod",
    chart: str = "monthly",
) -> Dict[str, Any]:
    data = dataset()
    selected_comparison = "samePeriod" if comparison == "samePeriod" else "fullYear"
    report = category_monthly_report(data, category_query, year, selected_comparison)
    rows = report["rows"]
    totals = report["totals"]
    label = str(report["label"])
    selected_year = int(report["year"])
    current_total = float(totals["amount"])
    previous_total = float(totals["previous_amount"])
    delta = current_total - previous_total
    non_zero_rows = [row for row in rows if abs(float(row["amount"])) > 0 or abs(float(row["previous_amount"])) > 0]
    peak = max(non_zero_rows, key=lambda row: abs(float(row["amount"])), default=None)
    largest_change = max(non_zero_rows, key=lambda row: abs(float(row["amount"]) - float(row["previous_amount"])), default=None)
    chart_mode = "difference" if chart == "difference" else "monthly"

    plot_data: List[Dict[str, Any]]
    if chart_mode == "difference":
        plot_data = [
            {
                "type": "bar",
                "name": f"Skillnad {selected_year} mot {selected_year - 1}",
                "x": [row["label"] for row in rows],
                "y": [round(float(row["amount"]) - float(row["previous_amount"])) for row in rows],
                "marker": {"color": ["#0e7a4f" if float(row["amount"]) <= float(row["previous_amount"]) else "#b9412d" for row in rows]},
            }
        ]
        title = f"Skillnad per månad: {label}"
    else:
        plot_data = [
            {
                "type": "bar",
                "name": f"{label} {selected_year}",
                "x": [row["label"] for row in rows],
                "y": [round(float(row["amount"])) for row in rows],
                "marker": {"color": "#b9412d"},
            },
            {
                "type": "bar",
                "name": f"{label} {selected_year - 1}",
                "x": [row["label"] for row in rows],
                "y": [round(float(row["previous_amount"])) for row in rows],
                "marker": {"color": "#d89180"},
            },
        ]
        title = f"{label} fördelat över året"

    if current_total == 0 and previous_total == 0:
        conclusion = f"Jag hittar inget tydligt utfall för {label.lower()} i den inlästa SIE-datan."
    else:
        direction = "högre" if delta > 0 else "lägre" if delta < 0 else "oförändrat"
        peak_text = f" Största månaden är {peak['label']} med {format_tkr(float(peak['amount']))}." if peak else ""
        change_text = (
            f" Största månadsavvikelsen är {largest_change['label']} med "
            f"{format_tkr(float(largest_change['amount']) - float(largest_change['previous_amount']))}."
            if largest_change
            else ""
        )
        conclusion = (
            f"{label} är {format_tkr(current_total)} {selected_year}, jämfört med "
            f"{format_tkr(previous_total)} {selected_year - 1}. Det är {format_tkr(abs(delta))} {direction}."
            f"{peak_text}{change_text}"
        )

    return {
        **report,
        "chart_mode": chart_mode,
        "answer": conclusion,
        "chart": {
            "title": title,
            "plotly": {
                "data": plot_data,
                "layout": {
                    "barmode": "group",
                    "margin": {"t": 36, "r": 18, "b": 38, "l": 58},
                    "paper_bgcolor": "#ffffff",
                    "plot_bgcolor": "#ffffff",
                    "yaxis": {"title": "SEK"},
                    "zeroline": True,
                },
                "config": {"displayModeBar": True, "responsive": True},
            },
        },
    }


def make_difference_plot(year: Optional[int], comparison: str = "samePeriod", metric: str = "result") -> Dict[str, Any]:
    data = dataset()
    selected_year = normalize_year(data, year)
    rows = monthly_report(data, selected_year, "samePeriod" if comparison == "samePeriod" else "fullYear")

    if metric == "income":
        values = [round(row.income - row.previous_income) for row in rows]
        title = f"Skillnad i intäkter {selected_year} mot {selected_year - 1}"
    elif metric == "cost":
        values = [round(row.costs - row.previous_costs) for row in rows]
        title = f"Skillnad i kostnader {selected_year} mot {selected_year - 1}"
    else:
        values = [round(row.result - row.previous_result) for row in rows]
        title = f"Resultatskillnad {selected_year} mot {selected_year - 1}"

    largest = max(zip(rows, values), key=lambda item: abs(item[1]), default=None)
    answer = (
        f"Största skillnaden syns i {largest[0].label}: {format_tkr(float(largest[1]))}."
        if largest
        else "Jag hittar ingen månadsdata att jämföra."
    )
    return {
        "year": selected_year,
        "comparison": comparison,
        "metric": metric,
        "values": [{"month": row.month, "label": row.label, "delta": value} for row, value in zip(rows, values)],
        "answer": answer,
        "chart": {
            "title": title,
            "plotly": {
                "data": [
                    {
                        "type": "bar",
                        "name": "Skillnad",
                        "x": [row.label for row in rows],
                        "y": values,
                        "marker": {"color": ["#0e7a4f" if value >= 0 else "#b9412d" for value in values]},
                    }
                ],
                "layout": {
                    "margin": {"t": 36, "r": 18, "b": 38, "l": 58},
                    "paper_bgcolor": "#ffffff",
                    "plot_bgcolor": "#ffffff",
                    "yaxis": {"title": "SEK"},
                },
                "config": {"displayModeBar": True, "responsive": True},
            },
        },
    }


def make_monthly_plot(year: Optional[int], comparison: str = "samePeriod") -> Dict[str, Any]:
    data = dataset()
    selected_year = normalize_year(data, year)
    rows = monthly_report(data, selected_year, "samePeriod" if comparison == "samePeriod" else "fullYear")
    labels = [row.label for row in rows]
    return {
        "title": f"Intäkter och kostnader {selected_year} jämfört med {selected_year - 1}",
        "plotly": {
            "data": [
                {"type": "bar", "name": f"Intäkter {selected_year}", "x": labels, "y": [round(row.income) for row in rows], "marker": {"color": "#0e7a4f"}},
                {"type": "bar", "name": f"Intäkter {selected_year - 1}", "x": labels, "y": [round(row.previous_income) for row in rows], "marker": {"color": "#86b89e"}},
                {"type": "bar", "name": f"Kostnader {selected_year}", "x": labels, "y": [round(row.costs) for row in rows], "marker": {"color": "#b9412d"}},
                {"type": "bar", "name": f"Kostnader {selected_year - 1}", "x": labels, "y": [round(row.previous_costs) for row in rows], "marker": {"color": "#d89180"}},
            ],
            "layout": {
                "barmode": "group",
                "margin": {"t": 36, "r": 18, "b": 38, "l": 58},
                "paper_bgcolor": "#ffffff",
                "plot_bgcolor": "#ffffff",
                "yaxis": {"title": "SEK"},
            },
            "config": {"displayModeBar": True, "responsive": True},
        },
    }


TOOL_DEFINITIONS = [
    {
        "name": "get_largest_income_or_expense",
        "description": "Hitta största intäkten eller utgiften för en viss månad.",
        "parameters": {"year": "number|null", "month": "1-12", "kind": "income|cost"},
    },
    {
        "name": "get_category_changes",
        "description": "Visa kategorier som blivit dyrare, billigare eller dragit iväg jämfört med föregående år.",
        "parameters": {"year": "number|null", "comparison": "samePeriod|fullYear", "limit": "number"},
    },
    {
        "name": "analyze_metric_changes",
        "description": "Analysera intäkter, kostnader eller resultat jämfört med föregående år och hitta största månadsökning och månadsminskning.",
        "parameters": {"year": "number|null", "comparison": "samePeriod|fullYear", "metric": "income|cost|result"},
    },
    {
        "name": "analyze_query_totals",
        "description": "Summera intäkter eller kostnader som matchar en söktext/motpart, exempelvis KAC, i verifikationstext, transaktionstext eller kontonamn.",
        "parameters": {"query": "string", "year": "number|null", "comparison": "samePeriod|fullYear", "kind": "income|cost|null"},
    },
    {
        "name": "list_accounts_for_query",
        "description": "Visa en tabell med alla konton som matchar en söktext/motpart, t.ex. alla intäktskonton för KAC.",
        "parameters": {"query": "string", "year": "number|null", "kind": "income|cost|null"},
    },
    {
        "name": "compare_query_table",
        "description": "Visa en tabell med konto-för-konto-skillnader för en söktext, t.ex. vad som skiljer planhyror mot föregående år.",
        "parameters": {"query": "string", "year": "number|null", "kind": "income|cost|null"},
    },
    {
        "name": "yearly_query_table",
        "description": "Visa en tabell som summerar en söktext per år, t.ex. intäkter för KAC över åren.",
        "parameters": {"query": "string", "kind": "income|cost|null"},
    },
    {
        "name": "transaction_rows_table",
        "description": "Visa alla matchande transaktionsrader i tabell för en söktext.",
        "parameters": {"query": "string", "year": "number|null", "kind": "income|cost|null", "limit": "number"},
    },
    {
        "name": "analyze_category_over_time",
        "description": "Analysera en viss begriplig kategori eller ett kontonamnsfragment över månader, till exempel personal, lokal eller IT. Kan visa månadsfördelning eller skillnader.",
        "parameters": {"category_query": "string", "year": "number|null", "comparison": "samePeriod|fullYear", "chart": "monthly|difference"},
    },
    {
        "name": "make_difference_plot",
        "description": "Skapa ett diagram som visar månadsvisa skillnader mot föregående år för resultat, intäkter eller kostnader.",
        "parameters": {"year": "number|null", "comparison": "samePeriod|fullYear", "metric": "result|income|cost"},
    },
    {
        "name": "make_monthly_plot",
        "description": "Skapa ett interaktivt Plotly-diagram för månadsjämförelse.",
        "parameters": {"year": "number|null", "comparison": "samePeriod|fullYear"},
    },
]
