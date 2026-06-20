from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.reports import (
    category_monthly_report,
    category_report,
    format_tkr,
    monthly_report,
    normalize_year,
    transactions_for_month,
)
from app.services.sie_parser import load_dataset


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
