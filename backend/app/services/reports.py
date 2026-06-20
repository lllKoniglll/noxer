import re
import unicodedata
from dataclasses import dataclass
from typing import Dict, Iterable, List, Literal, Optional, Tuple

from app.services.sie_parser import AccountingDataset, Transaction, Voucher


MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"]
ComparisonMode = Literal["fullYear", "samePeriod"]

CATEGORIES: List[Tuple[str, str, List[str]]] = [
    ("fees", "Medlems- och träningsavgifter", ["301", "305", "361"]),
    ("grants", "Bidrag och sponsring", ["321", "371", "372", "3812"]),
    ("sales", "Kiosk, café och försäljning", ["331", "332", "333", "351", "3814", "451"]),
    ("events", "Cuper och arrangemang", ["3811", "3815", "4055", "415", "431", "432", "481"]),
    ("facilities", "Planer, lokal och arena", ["4058", "501", "507", "582"]),
    ("football", "Domare, licenser och tävling", ["4053", "4063", "4068"]),
    ("people", "Personal och arvoden", ["641", "700", "701", "711", "741", "751", "753"]),
    ("admin", "Administration, IT och bank", ["611", "621", "623", "653", "657", "831"]),
    ("other", "Övrigt", []),
]

CATEGORY_ALIASES: Dict[str, List[str]] = {
    "fees": ["avgift", "medlem", "träning", "traning"],
    "grants": ["bidrag", "sponsor", "sponsring"],
    "sales": ["kiosk", "cafe", "café", "försäljning", "forsaljning"],
    "events": ["cup", "cuper", "arrangemang", "event"],
    "facilities": ["plan", "planer", "lokal", "arena", "hyra"],
    "football": ["domare", "licens", "licenser", "tävling", "tavling", "fotboll"],
    "people": ["personal", "arvode", "arvoden", "lön", "lon", "löner", "loner"],
    "admin": ["administration", "admin", "it", "bank"],
    "other": ["övrigt", "ovrigt"],
}


@dataclass
class MonthlyRow:
    month: int
    label: str
    income: float = 0
    costs: float = 0
    previous_income: float = 0
    previous_costs: float = 0

    @property
    def result(self) -> float:
        return self.income - self.costs

    @property
    def previous_result(self) -> float:
        return self.previous_income - self.previous_costs


def year_from_date(date: str) -> int:
    return int(date[:4])


def month_from_date(date: str) -> int:
    return int(date[4:6])


def normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.lower())
    return "".join(character for character in decomposed if not unicodedata.combining(character))


def acronym_for_text(value: str) -> str:
    words = re.findall(r"[a-zA-ZÅÄÖåäö0-9]+", normalize_text(value))
    return "".join(word[0] for word in words if word)


def text_matches_query(query: str, value: str) -> bool:
    normalized_query = normalize_text(query).replace(" ", "")
    normalized_value = normalize_text(value)
    if normalize_text(query) in normalized_value:
        return True
    acronym = acronym_for_text(value)
    if len(normalized_query) >= 2 and (normalized_query == acronym or normalized_query in acronym):
        return True
    return False


def normalize_year(dataset: AccountingDataset, year: Optional[int]) -> int:
    if year:
        return year
    years = sorted({year_from_date(voucher.date) for voucher in dataset.vouchers})
    return years[-1] if years else 2026


def latest_date_for_year(dataset: AccountingDataset, year: int) -> Optional[str]:
    dates = [voucher.date for voucher in dataset.vouchers if year_from_date(voucher.date) == year]
    return max(dates) if dates else None


def previous_cutoff(dataset: AccountingDataset, year: int, comparison: ComparisonMode) -> Optional[str]:
    if comparison == "fullYear":
        return None
    latest = latest_date_for_year(dataset, year)
    return f"{year - 1}{latest[4:]}" if latest else None


def result_kind(transaction: Transaction) -> Optional[str]:
    if transaction.account.startswith("3"):
        return "income"
    if transaction.account[:1] in {"4", "5", "6", "7", "8"}:
        return "cost"
    return None


def category_for_account(account: str) -> Tuple[str, str]:
    for category_id, label, prefixes in CATEGORIES:
        if prefixes and any(account.startswith(prefix) for prefix in prefixes):
            return category_id, label
    return "other", "Övrigt"


def category_label(category_id: str) -> str:
    for current_id, label, _ in CATEGORIES:
        if current_id == category_id:
            return label
    return "Övrigt"


def match_category(query: str) -> Optional[Tuple[str, str]]:
    normalized_query = normalize_text(query)
    for category_id, label, _ in CATEGORIES:
        label_match = normalize_text(label)
        aliases = [normalize_text(alias) for alias in CATEGORY_ALIASES.get(category_id, [])]
        if category_id in normalized_query or label_match in normalized_query:
            return category_id, label
        if any(alias in normalized_query for alias in aliases):
            return category_id, label
    return None


def vouchers_for_years(dataset: AccountingDataset, year: int, comparison: ComparisonMode) -> Iterable[Voucher]:
    cutoff = previous_cutoff(dataset, year, comparison)
    for voucher in dataset.vouchers:
        voucher_year = year_from_date(voucher.date)
        if voucher_year not in {year, year - 1}:
            continue
        if voucher_year == year - 1 and cutoff and voucher.date > cutoff:
            continue
        yield voucher


def monthly_report(dataset: AccountingDataset, year: Optional[int] = None, comparison: ComparisonMode = "fullYear") -> List[MonthlyRow]:
    selected_year = normalize_year(dataset, year)
    rows = {index + 1: MonthlyRow(month=index + 1, label=label) for index, label in enumerate(MONTH_LABELS)}

    for voucher in vouchers_for_years(dataset, selected_year, comparison):
        voucher_year = year_from_date(voucher.date)
        row = rows[month_from_date(voucher.date)]
        for transaction in voucher.transactions:
            kind = result_kind(transaction)
            if kind is None:
                continue
            amount = -transaction.amount if kind == "income" else transaction.amount
            if voucher_year == selected_year and kind == "income":
                row.income += amount
            elif voucher_year == selected_year and kind == "cost":
                row.costs += amount
            elif kind == "income":
                row.previous_income += amount
            else:
                row.previous_costs += amount

    return list(rows.values())


def category_report(dataset: AccountingDataset, year: Optional[int] = None, comparison: ComparisonMode = "fullYear") -> List[Dict[str, float]]:
    selected_year = normalize_year(dataset, year)
    rows: Dict[str, Dict[str, float]] = {
        category_id: {"id": category_id, "label": label, "amount": 0.0, "previous_amount": 0.0}
        for category_id, label, _ in CATEGORIES
    }

    for voucher in vouchers_for_years(dataset, selected_year, comparison):
        voucher_year = year_from_date(voucher.date)
        for transaction in voucher.transactions:
            kind = result_kind(transaction)
            if kind is None:
                continue
            category_id, _ = category_for_account(transaction.account)
            amount = -transaction.amount if kind == "income" else transaction.amount
            if voucher_year == selected_year:
                rows[category_id]["amount"] += amount
            else:
                rows[category_id]["previous_amount"] += amount

    return sorted(rows.values(), key=lambda row: abs(row["amount"]), reverse=True)


def category_monthly_report(
    dataset: AccountingDataset,
    category_query: str,
    year: Optional[int] = None,
    comparison: ComparisonMode = "samePeriod",
) -> Dict[str, object]:
    selected_year = normalize_year(dataset, year)
    matched = match_category(category_query)
    rows = {
        index + 1: {
            "month": index + 1,
            "label": label,
            "amount": 0.0,
            "previous_amount": 0.0,
            "accounts": {},
        }
        for index, label in enumerate(MONTH_LABELS)
    }

    for voucher in vouchers_for_years(dataset, selected_year, comparison):
        voucher_year = year_from_date(voucher.date)
        row = rows[month_from_date(voucher.date)]
        for transaction in voucher.transactions:
            kind = result_kind(transaction)
            if kind is None:
                continue
            transaction_category_id, transaction_category_label = category_for_account(transaction.account)
            account = dataset.accounts.get(transaction.account)
            account_name = account.name if account else transaction.account
            account_text = normalize_text(f"{transaction.account} {account_name} {transaction.text}")
            query_text = normalize_text(category_query)

            if matched:
                include = transaction_category_id == matched[0]
                selected_label = matched[1]
            else:
                include = query_text in account_text
                selected_label = category_query
            if not include:
                continue

            amount = -transaction.amount if kind == "income" else transaction.amount
            target = "amount" if voucher_year == selected_year else "previous_amount"
            row[target] = float(row[target]) + amount
            accounts: Dict[str, float] = row["accounts"]  # type: ignore[assignment]
            accounts[account_name] = accounts.get(account_name, 0.0) + amount

    monthly_rows = list(rows.values())
    totals = {
        "amount": sum(float(row["amount"]) for row in monthly_rows),
        "previous_amount": sum(float(row["previous_amount"]) for row in monthly_rows),
    }
    return {
        "category_id": matched[0] if matched else None,
        "label": matched[1] if matched else category_query,
        "year": selected_year,
        "comparison": comparison,
        "rows": monthly_rows,
        "totals": totals,
    }


def query_monthly_report(
    dataset: AccountingDataset,
    query: str,
    year: Optional[int] = None,
    comparison: ComparisonMode = "samePeriod",
    kind: Optional[str] = None,
) -> Dict[str, object]:
    selected_year = normalize_year(dataset, year)
    rows = {
        index + 1: {
            "month": index + 1,
            "label": label,
            "amount": 0.0,
            "previous_amount": 0.0,
            "transactions": [],
        }
        for index, label in enumerate(MONTH_LABELS)
    }
    account_totals: Dict[str, float] = {}

    for voucher in vouchers_for_years(dataset, selected_year, comparison):
        voucher_year = year_from_date(voucher.date)
        row = rows[month_from_date(voucher.date)]
        for transaction in voucher.transactions:
            transaction_kind = result_kind(transaction)
            if transaction_kind is None or (kind and transaction_kind != kind):
                continue
            account = dataset.accounts.get(transaction.account)
            account_name = account.name if account else transaction.account
            haystack = f"{voucher.text} {transaction.text} {transaction.account} {account_name} {voucher.series}{voucher.number}"
            if not text_matches_query(query, haystack):
                continue

            amount = -transaction.amount if transaction_kind == "income" else transaction.amount
            target = "amount" if voucher_year == selected_year else "previous_amount"
            row[target] = float(row[target]) + amount
            if voucher_year == selected_year:
                account_totals[account_name] = account_totals.get(account_name, 0.0) + amount
            row["transactions"].append(
                {
                    "date": voucher.date,
                    "voucher": f"{voucher.series}{voucher.number}",
                    "description": voucher.text,
                    "account": transaction.account,
                    "account_name": account_name,
                    "kind": transaction_kind,
                    "amount": amount,
                }
            )

    monthly_rows = list(rows.values())
    totals = {
        "amount": sum(float(row["amount"]) for row in monthly_rows),
        "previous_amount": sum(float(row["previous_amount"]) for row in monthly_rows),
    }
    top_accounts = sorted(
        [{"name": name, "amount": amount} for name, amount in account_totals.items()],
        key=lambda item: abs(item["amount"]),
        reverse=True,
    )[:8]
    return {
        "query": query,
        "year": selected_year,
        "comparison": comparison,
        "kind": kind,
        "rows": monthly_rows,
        "totals": totals,
        "top_accounts": top_accounts,
    }


def transactions_for_month(dataset: AccountingDataset, year: int, month: int, kind: Optional[str] = None) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for voucher in dataset.vouchers:
        if year_from_date(voucher.date) != year or month_from_date(voucher.date) != month:
            continue
        for transaction in voucher.transactions:
            transaction_kind = result_kind(transaction)
            if transaction_kind is None or (kind and transaction_kind != kind):
                continue
            amount = -transaction.amount if transaction_kind == "income" else transaction.amount
            account = dataset.accounts.get(transaction.account)
            rows.append(
                {
                    "date": voucher.date,
                    "voucher": f"{voucher.series}{voucher.number}",
                    "description": voucher.text,
                    "account": transaction.account,
                    "account_name": account.name if account else transaction.account,
                    "kind": transaction_kind,
                    "amount": amount,
                }
            )
    return sorted(rows, key=lambda row: abs(float(row["amount"])), reverse=True)


def format_tkr(value: float) -> str:
    return f"{round(value / 1000):,}".replace(",", " ") + " tkr"
