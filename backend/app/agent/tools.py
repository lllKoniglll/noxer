from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.reports import (
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
        "name": "make_monthly_plot",
        "description": "Skapa ett interaktivt Plotly-diagram för månadsjämförelse.",
        "parameters": {"year": "number|null", "comparison": "samePeriod|fullYear"},
    },
]
