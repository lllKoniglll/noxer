import sqlite3
from typing import Any, Dict, List, Optional, Sequence

from app.services.reports import acronym_for_text, category_for_account, month_from_date, result_kind, year_from_date
from app.services.sie_parser import AccountingDataset


def build_connection(dataset: AccountingDataset) -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        create table transactions (
            date text not null,
            year integer not null,
            month integer not null,
            voucher text not null,
            description text not null,
            account text not null,
            account_name text not null,
            category_id text not null,
            category_label text not null,
            kind text not null,
            amount real not null,
            raw_amount real not null,
            transaction_text text not null,
            source_file text not null,
            search_text text not null,
            search_acronym text not null
        )
        """
    )

    rows = []
    for voucher in dataset.vouchers:
        for transaction in voucher.transactions:
            kind = result_kind(transaction)
            if kind is None:
                continue
            account = dataset.accounts.get(transaction.account)
            account_name = account.name if account else transaction.account
            category_id, category_label = category_for_account(transaction.account)
            amount = -transaction.amount if kind == "income" else transaction.amount
            search_text = " ".join(
                [
                    voucher.text,
                    transaction.text,
                    transaction.account,
                    account_name,
                    category_label,
                    f"{voucher.series}{voucher.number}",
                ]
            ).lower()
            rows.append(
                (
                    voucher.date,
                    year_from_date(voucher.date),
                    month_from_date(voucher.date),
                    f"{voucher.series}{voucher.number}",
                    voucher.text,
                    transaction.account,
                    account_name,
                    category_id,
                    category_label,
                    kind,
                    amount,
                    transaction.amount,
                    transaction.text,
                    voucher.source_file,
                    search_text,
                    acronym_for_text(search_text),
                )
            )

    connection.executemany(
        """
        insert into transactions (
            date, year, month, voucher, description, account, account_name,
            category_id, category_label, kind, amount, raw_amount,
            transaction_text, source_file, search_text, search_acronym
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    return connection


def query_rows(connection: sqlite3.Connection, sql: str, parameters: Sequence[Any] = ()) -> List[Dict[str, Any]]:
    lowered = sql.strip().lower()
    if not lowered.startswith("select"):
        raise ValueError("Only SELECT queries are allowed")
    if ";" in lowered or "--" in lowered or "/*" in lowered:
        raise ValueError("Query contains a disallowed token")
    if any(token in lowered for token in [" insert ", " update ", " delete ", " drop ", " alter ", " pragma ", " attach "]):
        raise ValueError("Query contains a disallowed statement")
    cursor = connection.execute(sql, parameters)
    return [dict(row) for row in cursor.fetchall()]


def like_pattern(query: str) -> str:
    return f"%{query.lower()}%"


def latest_year(dataset: AccountingDataset, year: Optional[int]) -> int:
    if year:
        return year
    years = sorted({year_from_date(voucher.date) for voucher in dataset.vouchers})
    return years[-1] if years else 2026
