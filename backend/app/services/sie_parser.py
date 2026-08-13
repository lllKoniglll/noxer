import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional


TOKEN_PATTERN = re.compile(r'"([^"]*)"|\{[^}]*\}|[^\s]+')


@dataclass
class Account:
    code: str
    name: str


@dataclass
class Transaction:
    account: str
    amount: float
    text: str = ""


@dataclass
class Voucher:
    series: str
    number: str
    date: str
    text: str
    registration_date: Optional[str]
    source_file: str
    transactions: List[Transaction] = field(default_factory=list)


@dataclass
class AccountingDataset:
    organization_name: str
    files: List[str]
    accounts: Dict[str, Account]
    vouchers: List[Voucher]
    latest_voucher_date: Optional[str]


def tokenize(line: str) -> List[str]:
    return [match.group(1) if match.group(1) is not None else match.group(0) for match in TOKEN_PATTERN.finditer(line)]


def parse_amount(value: Optional[str]) -> float:
    if not value:
        return 0.0
    return float(value.replace(",", "."))


def parse_sie_file(path: Path) -> AccountingDataset:
    return parse_sie_bytes(path.read_bytes(), path.name)


def parse_sie_bytes(content: bytes, file_name: str) -> AccountingDataset:
    text = content.decode("cp437")
    accounts: Dict[str, Account] = {}
    vouchers: List[Voucher] = []
    organization_name = ""
    current_voucher: Optional[Voucher] = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line in {"{", "}"}:
            continue

        tokens = tokenize(line)
        if not tokens:
            continue

        tag = tokens[0]

        if tag == "#FNAMN" and len(tokens) > 1:
            organization_name = tokens[1]
            continue

        if tag == "#KONTO" and len(tokens) > 2:
            accounts[tokens[1]] = Account(code=tokens[1], name=tokens[2])
            continue

        if tag == "#VER" and len(tokens) >= 5:
            current_voucher = Voucher(
                series=tokens[1],
                number=tokens[2],
                date=tokens[3],
                text=tokens[4],
                registration_date=tokens[5] if len(tokens) > 5 else None,
                source_file=file_name,
            )
            vouchers.append(current_voucher)
            continue

        if tag == "#TRANS" and current_voucher is not None and len(tokens) >= 4:
            current_voucher.transactions.append(
                Transaction(
                    account=tokens[1],
                    amount=parse_amount(tokens[3]),
                    text=tokens[5] if len(tokens) > 5 and tokens[5] != "0" else "",
                )
            )

    latest_voucher_date = max((voucher.date for voucher in vouchers), default=None)
    return AccountingDataset(
        organization_name=organization_name or "Kronängs IF",
        files=[file_name],
        accounts=accounts,
        vouchers=vouchers,
        latest_voucher_date=latest_voucher_date,
    )


def load_dataset(sie_dir: Path) -> AccountingDataset:
    files = sorted(path for path in sie_dir.iterdir() if path.suffix.lower() == ".se")
    parsed = [parse_sie_file(path) for path in files]

    accounts: Dict[str, Account] = {}
    vouchers: List[Voucher] = []
    file_names: List[str] = []

    for dataset in parsed:
        accounts.update(dataset.accounts)
        vouchers.extend(dataset.vouchers)
        file_names.extend(dataset.files)

    seen = set()
    unique_vouchers: List[Voucher] = []
    for voucher in sorted(vouchers, key=lambda item: item.date):
        key = (voucher.date, voucher.series, voucher.number, voucher.text)
        if key in seen:
            continue
        seen.add(key)
        unique_vouchers.append(voucher)

    latest_voucher_date = max((voucher.date for voucher in unique_vouchers), default=None)
    return AccountingDataset(
        organization_name=next((dataset.organization_name for dataset in parsed if dataset.organization_name), "Kronängs IF"),
        files=file_names,
        accounts=accounts,
        vouchers=unique_vouchers,
        latest_voucher_date=latest_voucher_date,
    )


def load_dataset_from_bytes(files: List[tuple[str, bytes]]) -> AccountingDataset:
    parsed = [parse_sie_bytes(content, file_name) for file_name, content in files]
    accounts: Dict[str, Account] = {}
    vouchers: List[Voucher] = []
    file_names: List[str] = []
    organization_name = ""
    for dataset in parsed:
        accounts.update(dataset.accounts)
        vouchers.extend(dataset.vouchers)
        file_names.extend(dataset.files)
        organization_name = organization_name or dataset.organization_name
    vouchers.sort(key=lambda voucher: voucher.date)
    return AccountingDataset(
        organization_name=organization_name or "Kronängs IF",
        files=file_names,
        accounts=accounts,
        vouchers=vouchers,
        latest_voucher_date=max((voucher.date for voucher in vouchers), default=None),
    )
