import { parseSieBuffer } from "@/lib/sie/parser";
import type {
  AccountingDataset,
  Balance,
  CashPoint,
  CategorySummary,
  MonthlyReportRow,
  Transaction,
  Voucher
} from "@/lib/sie/types";
import { ACCOUNT_CATEGORIES, getAccountCategory } from "./categories";

const CASH_ACCOUNTS = new Set(["1910", "1920", "1930", "1939", "1940", "1950", "1960"]);
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Maj",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dec"
];

export type ComparisonMode = "fullYear" | "samePeriod";

export function parseComparisonMode(value: string | string[] | undefined): ComparisonMode {
  return value === "samePeriod" ? "samePeriod" : "fullYear";
}

function yearFromDate(date: string): number {
  return Number(date.slice(0, 4));
}

function monthFromDate(date: string): number {
  return Number(date.slice(4, 6));
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function roundSek(value: number): number {
  return Math.round(value);
}

function latestVoucherDateForYear(dataset: AccountingDataset, selectedYear: number): string | undefined {
  return dataset.vouchers
    .filter((voucher) => yearFromDate(voucher.date) === selectedYear)
    .map((voucher) => voucher.date)
    .sort()
    .at(-1);
}

export function comparisonCutoffDate(
  dataset: AccountingDataset,
  selectedYear: number,
  comparisonMode: ComparisonMode
): string | undefined {
  const latestDate = latestVoucherDateForYear(dataset, selectedYear);
  if (!latestDate || comparisonMode === "fullYear") return undefined;
  return `${selectedYear - 1}${latestDate.slice(4)}`;
}

export function comparisonModeLabel(comparisonMode: ComparisonMode): string {
  return comparisonMode === "samePeriod" ? "Samma period" : "Hela föregående år";
}

export function formatSieDate(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function uniqueVouchers(vouchers: Voucher[]): Voucher[] {
  const seen = new Set<string>();
  const result: Voucher[] = [];

  for (const voucher of vouchers) {
    const key = `${voucher.date}:${voucher.series}:${voucher.number}:${voucher.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(voucher);
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function balanceKey(balance: Balance): string {
  return `${balance.yearIndex}:${balance.account}`;
}

function uniqueBalances(balances: Balance[]): Balance[] {
  const byKey = new Map<string, Balance>();
  for (const balance of balances) byKey.set(balanceKey(balance), balance);
  return Array.from(byKey.values());
}

export function emptyAccountingDataset(): AccountingDataset {
  return {
    organizationName: "Noxer",
    files: [],
    accounts: new Map(),
    fiscalYears: [],
    vouchers: [],
    openingBalances: [],
    closingBalances: [],
    resultBalances: []
  };
}

export async function loadAccountingDataset(uploadedFiles: File[] = []): Promise<AccountingDataset> {
  const files = await Promise.all(
    uploadedFiles
      .map(async (file) => parseSieBuffer(new Uint8Array(await file.arrayBuffer()), file.name))
  );

  if (!files.length) return emptyAccountingDataset();

  const accounts = new Map();
  for (const file of files) {
    for (const [code, account] of file.accounts) accounts.set(code, account);
  }

  const vouchers = uniqueVouchers(files.flatMap((file) => file.vouchers));
  const latestVoucherDate = vouchers.at(-1)?.date;

  return {
    organizationName: files.find((file) => file.companyName)?.companyName ?? "Kronängs IF",
    files: files.map((file) => file.fileName),
    accounts,
    fiscalYears: files.flatMap((file) => file.fiscalYears),
    vouchers,
    openingBalances: uniqueBalances(files.flatMap((file) => file.openingBalances)),
    closingBalances: uniqueBalances(files.flatMap((file) => file.closingBalances)),
    resultBalances: uniqueBalances(files.flatMap((file) => file.resultBalances)),
    latestVoucherDate
  };
}

export function getAvailableYears(dataset: AccountingDataset): number[] {
  return Array.from(new Set(dataset.vouchers.map((voucher) => yearFromDate(voucher.date)))).sort();
}

function classifyResultTransaction(transaction: Transaction): "income" | "cost" | null {
  const accountClass = transaction.account[0];
  if (accountClass === "3") return "income";
  if (["4", "5", "6", "7", "8"].includes(accountClass)) return "cost";
  return null;
}

export function buildMonthlyReport(
  dataset: AccountingDataset,
  selectedYear: number,
  comparisonMode: ComparisonMode = "fullYear"
): MonthlyReportRow[] {
  const current = new Map<string, { income: number; costs: number }>();
  const previous = new Map<string, { income: number; costs: number }>();
  const previousCutoff = comparisonCutoffDate(dataset, selectedYear, comparisonMode);

  for (const voucher of dataset.vouchers) {
    const year = yearFromDate(voucher.date);
    if (year !== selectedYear && year !== selectedYear - 1) continue;
    if (year === selectedYear - 1 && previousCutoff && voucher.date > previousCutoff) continue;

    const month = monthFromDate(voucher.date);
    const key = monthKey(year, month);

    for (const transaction of voucher.transactions) {
      const kind = classifyResultTransaction(transaction);
      if (!kind) continue;

      if (year === selectedYear) {
        const row = current.get(key) ?? { income: 0, costs: 0 };
        if (kind === "income") row.income += -transaction.amount;
        if (kind === "cost") row.costs += transaction.amount;
        current.set(key, row);
      } else {
        const row = previous.get(key) ?? { income: 0, costs: 0 };
        if (kind === "income") row.income += -transaction.amount;
        if (kind === "cost") row.costs += transaction.amount;
        previous.set(key, row);
      }
    }
  }

  return MONTH_LABELS.map((label, index) => {
    const month = index + 1;
    const row = current.get(monthKey(selectedYear, month)) ?? { income: 0, costs: 0 };
    const previousRow = previous.get(monthKey(selectedYear - 1, month)) ?? { income: 0, costs: 0 };

    return {
      month: String(month).padStart(2, "0"),
      label,
      income: roundSek(row.income),
      costs: roundSek(row.costs),
      result: roundSek(row.income - row.costs),
      previousYearIncome: roundSek(previousRow.income),
      previousYearCosts: roundSek(previousRow.costs),
      previousYearResult: roundSek(previousRow.income - previousRow.costs)
    };
  });
}

export function buildCategorySummary(
  dataset: AccountingDataset,
  selectedYear: number,
  comparisonMode: ComparisonMode = "fullYear"
): CategorySummary[] {
  const summary = new Map<string, CategorySummary>();
  const previousCutoff = comparisonCutoffDate(dataset, selectedYear, comparisonMode);

  for (const category of ACCOUNT_CATEGORIES) {
    summary.set(category.id, {
      id: category.id,
      label: category.label,
      amount: 0,
      previousAmount: 0
    });
  }

  for (const voucher of dataset.vouchers) {
    const year = yearFromDate(voucher.date);
    if (year !== selectedYear && year !== selectedYear - 1) continue;
    if (year === selectedYear - 1 && previousCutoff && voucher.date > previousCutoff) continue;

    for (const transaction of voucher.transactions) {
      if (!classifyResultTransaction(transaction)) continue;

      const category = getAccountCategory(transaction.account);
      const row = summary.get(category.id);
      if (!row) continue;

      const signed = transaction.account.startsWith("3") ? -transaction.amount : transaction.amount;
      if (year === selectedYear) row.amount += signed;
      if (year === selectedYear - 1) row.previousAmount += signed;
    }
  }

  return Array.from(summary.values())
    .map((row) => ({
      ...row,
      amount: roundSek(row.amount),
      previousAmount: roundSek(row.previousAmount)
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function cashOpeningBalance(dataset: AccountingDataset): number {
  return dataset.openingBalances
    .filter((balance) => balance.yearIndex === 0 && CASH_ACCOUNTS.has(balance.account))
    .reduce((sum, balance) => sum + balance.amount, 0);
}

export function buildCashForecast(dataset: AccountingDataset, selectedYear: number): CashPoint[] {
  const opening = cashOpeningBalance(dataset);
  const monthlyActualFlow = new Map<string, number>();
  const previousYearFlow = new Map<number, number>();
  const latestMonth = dataset.latestVoucherDate ? monthFromDate(dataset.latestVoucherDate) : 0;

  for (const voucher of dataset.vouchers) {
    const year = yearFromDate(voucher.date);
    const month = monthFromDate(voucher.date);
    const cashFlow = voucher.transactions
      .filter((transaction) => CASH_ACCOUNTS.has(transaction.account))
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    if (year === selectedYear) {
      monthlyActualFlow.set(monthKey(year, month), (monthlyActualFlow.get(monthKey(year, month)) ?? 0) + cashFlow);
    }

    if (year === selectedYear - 1) {
      previousYearFlow.set(month, (previousYearFlow.get(month) ?? 0) + cashFlow);
    }
  }

  let actualBalance = opening;
  let forecastBalance = opening;

  return MONTH_LABELS.map((label, index) => {
    const month = index + 1;
    const actualFlow = monthlyActualFlow.get(monthKey(selectedYear, month)) ?? 0;

    if (month <= latestMonth) {
      actualBalance += actualFlow;
      forecastBalance = actualBalance;
      return {
        month: String(month).padStart(2, "0"),
        label,
        actual: roundSek(actualBalance),
        forecast: null
      };
    }

    forecastBalance += previousYearFlow.get(month) ?? 0;
    return {
      month: String(month).padStart(2, "0"),
      label,
      actual: null,
      forecast: roundSek(forecastBalance)
    };
  });
}

export function formatSek(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "SEK"
  }).format(value);
}

export function formatThousands(value: number): string {
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(value / 1000)} tkr`;
}
