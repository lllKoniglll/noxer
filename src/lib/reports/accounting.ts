import { parseSieBuffer } from "@/lib/sie/parser";
import type {
  AccountingDataset,
  Balance,
  CashPoint,
  CategorySummary,
  MonthlyReportRow,
  Transaction,
  Voucher,
  BudgetDataset
} from "@/lib/sie/types";
import { ACCOUNT_CATEGORIES, getAccountCategory, type AccountCategory } from "./categories";

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

export type AccountComparisonMonth = {
  month: string;
  label: string;
  years: Record<string, number>;
};

export type AccountComparisonCategory = {
  id: string;
  label: string;
  years: Record<string, number>;
};

export type AccountComparisonTransaction = {
  account: string;
  accountName: string;
  date: string;
  voucher: string;
  text: string;
  years: Record<string, number>;
};

export type CategoryAccountSummary = {
  account: string;
  name: string;
  amount: number;
  previousAmount: number;
};

export type MonthlyCategorySummary = {
  id: string;
  label: string;
  amount: number;
};

export type MonthlyCategoryTransaction = {
  sourceYear: number;
  account: string;
  accountName: string;
  date: string;
  voucher: string;
  text: string;
  amount: number;
};

function liquidityVoucherIncluded(
  dataset: AccountingDataset,
  voucher: Voucher,
  selectedYear: number,
  month: number,
  forecastMode: CashForecastMode
): boolean {
  const latestDate = latestVoucherDateForYear(dataset, selectedYear);
  if (!latestDate) return false;
  if (monthFromDate(voucher.date) !== month) return false;
  const latestMonth = monthFromDate(latestDate);
  const partialLatestMonth = !isEndOfMonth(latestDate);
  const year = yearFromDate(voucher.date);

  if (year === selectedYear) {
    if (month < latestMonth) return true;
    if (month === latestMonth && forecastMode === "latestDate") return !partialLatestMonth || voucher.date <= latestDate;
    return false;
  }

  if (year === selectedYear - 1) {
    if (month > latestMonth) return true;
    if (month === latestMonth) {
      if (forecastMode === "fullMonth") return true;
      return partialLatestMonth && voucher.date > `${selectedYear - 1}${latestDate.slice(4)}`;
    }
  }
  return false;
}

export type AccountActivity = {
  account: string;
  name: string;
  latestResult: number;
};

export type BudgetCategorySummary = {
  id: string;
  label: string;
  budget: number;
  actual: number;
  variance: number;
};

export type BudgetAccountSummary = {
  account: string;
  name: string;
  budget: number;
  actual: number;
  variance: number;
};

export type BudgetPeriodizationCategory = {
  id: string;
  label: string;
  budget: number;
  periodized: number[];
  actual: number[];
};

export type BudgetPeriodizationReport = {
  categories: BudgetPeriodizationCategory[];
  months: Array<{ month: number; label: string; budget: number; actual: number; variance: number }>;
  historicalYears: number[];
  latestMonth: number;
};

export type BudgetPeriodizationMode = "straight" | "history";

export type ComparisonMode = "fullYear" | "samePeriod";
export type CashForecastMode = "latestDate" | "fullMonth";

export function parseComparisonMode(value: string | string[] | undefined): ComparisonMode {
  return value === "fullYear" ? "fullYear" : "samePeriod";
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

function comparisonAmount(transaction: Transaction): number {
  // Result accounts use the report convention: income positive, expenses
  // negative. In SIE, both are normally the opposite sign in the ledger.
  const accountClass = transaction.account[0];
  if (accountClass && "345678".includes(accountClass)) return -transaction.amount;
  return transaction.amount;
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
      .filter((file) => !file.name.toLowerCase().endsWith(".xls"))
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

function actualAmountsByAccount(dataset: AccountingDataset, year: number): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const voucher of dataset.vouchers) {
    if (yearFromDate(voucher.date) !== year) continue;
    for (const transaction of voucher.transactions) {
      if (!classifyResultTransaction(transaction)) continue;
      amounts.set(transaction.account, (amounts.get(transaction.account) ?? 0) + comparisonAmount(transaction));
    }
  }
  return amounts;
}

export function buildBudgetAccountSummary(dataset: AccountingDataset, budget: BudgetDataset): BudgetAccountSummary[] {
  const actuals = actualAmountsByAccount(dataset, budget.year);
  const accountNames = dataset.accounts;
  return budget.rows
    .map((row) => ({
      account: row.account,
      name: accountNames.get(row.account)?.name ?? row.name,
      budget: roundSek(row.amount),
      actual: roundSek(actuals.get(row.account) ?? 0),
      variance: roundSek((actuals.get(row.account) ?? 0) - row.amount)
    }))
    .sort((left, right) => Math.abs(right.budget) - Math.abs(left.budget) || left.account.localeCompare(right.account, "sv", { numeric: true }));
}

export function buildUnbudgetedAccountSummary(dataset: AccountingDataset, budget: BudgetDataset): BudgetAccountSummary[] {
  const actuals = actualAmountsByAccount(dataset, budget.year);
  const budgetedAccounts = new Set(budget.rows.map((row) => row.account));
  return Array.from(actuals.entries())
    .filter(([account, actual]) => !budgetedAccounts.has(account) && actual !== 0)
    .map(([account, actual]) => ({
      account,
      name: dataset.accounts.get(account)?.name ?? "Okänt konto",
      budget: 0,
      actual: roundSek(actual),
      variance: roundSek(actual)
    }))
    .sort((left, right) => Math.abs(right.actual) - Math.abs(left.actual) || left.account.localeCompare(right.account, "sv", { numeric: true }));
}

export function buildBudgetCategorySummary(dataset: AccountingDataset, budget: BudgetDataset, categories: AccountCategory[] = ACCOUNT_CATEGORIES): BudgetCategorySummary[] {
  const accounts = buildBudgetAccountSummary(dataset, budget);
  const categoryRows = new Map<string, BudgetCategorySummary>();
  for (const category of categories) {
    categoryRows.set(category.id, { id: category.id, label: category.label, budget: 0, actual: 0, variance: 0 });
  }
  for (const account of accounts) {
    const category = getAccountCategory(account.account, categories);
    const row = categoryRows.get(category.id);
    if (!row) continue;
    row.budget += account.budget;
    row.actual += account.actual;
    row.variance += account.variance;
  }
  return Array.from(categoryRows.values())
    .map((row) => ({ ...row, budget: roundSek(row.budget), actual: roundSek(row.actual), variance: roundSek(row.variance) }))
    .filter((row) => row.budget !== 0 || row.actual !== 0)
    .sort((left, right) => Math.abs(right.actual) - Math.abs(left.actual));
}

export function buildBudgetPeriodization(
  dataset: AccountingDataset,
  budget: BudgetDataset,
  categories: AccountCategory[] = ACCOUNT_CATEGORIES,
  mode: BudgetPeriodizationMode = "history"
): BudgetPeriodizationReport {
  const budgetByCategory = new Map(categories.map((category) => [category.id, 0]));
  for (const row of budget.rows) {
    const category = getAccountCategory(row.account, categories);
    budgetByCategory.set(category.id, (budgetByCategory.get(category.id) ?? 0) + row.amount);
  }

  const historicalYears = getAvailableYears(dataset).filter((year) => year < budget.year).slice(-2);
  const historicalByYear = new Map<number, Map<string, number[]>>();
  for (const year of historicalYears) {
    const byCategory = new Map<string, number[]>();
    for (const category of categories) byCategory.set(category.id, Array(12).fill(0));
    for (const voucher of dataset.vouchers) {
      if (yearFromDate(voucher.date) !== year) continue;
      const month = monthFromDate(voucher.date) - 1;
      for (const transaction of voucher.transactions) {
        if (!classifyResultTransaction(transaction)) continue;
        const values = byCategory.get(getAccountCategory(transaction.account, categories).id);
        if (values) values[month] += Math.abs(comparisonAmount(transaction));
      }
    }
    historicalByYear.set(year, byCategory);
  }

  const actualByCategory = new Map<string, number[]>();
  for (const category of categories) actualByCategory.set(category.id, Array(12).fill(0));
  for (const voucher of dataset.vouchers) {
    if (yearFromDate(voucher.date) !== budget.year) continue;
    const month = monthFromDate(voucher.date) - 1;
    for (const transaction of voucher.transactions) {
      if (!classifyResultTransaction(transaction)) continue;
      const values = actualByCategory.get(getAccountCategory(transaction.account, categories).id);
      if (values) values[month] += comparisonAmount(transaction);
    }
  }

  const periodizedCategories = categories.map((category) => {
    const categoryBudget = budgetByCategory.get(category.id) ?? 0;
    const rawShares = mode === "straight" ? Array(12).fill(1 / 12) : Array.from({ length: 12 }, (_, month) => {
      const yearlyShares = historicalYears.map((year) => {
        const values = historicalByYear.get(year)?.get(category.id) ?? [];
        const total = values.reduce((sum, value) => sum + value, 0);
        return total > 0 ? values[month] / total : null;
      }).filter((value): value is number => value !== null);
      return yearlyShares.length ? yearlyShares.reduce((sum, value) => sum + value, 0) / yearlyShares.length : 1 / 12;
    });
    const shareTotal = rawShares.reduce((sum, share) => sum + share, 0);
    const shares = shareTotal > 0 ? rawShares.map((share) => share / shareTotal) : Array(12).fill(1 / 12);
    let allocated = 0;
    const periodized = shares.map((share, month) => {
      const amount = month === shares.length - 1 ? categoryBudget - allocated : categoryBudget * share;
      allocated += amount;
      return amount;
    });
    return {
      id: category.id,
      label: category.label,
      budget: roundSek(categoryBudget),
      periodized,
      actual: (actualByCategory.get(category.id) ?? Array(12).fill(0)).map(roundSek)
    };
  });

  const latestDate = latestVoucherDateForYear(dataset, budget.year);
  const latestMonth = latestDate ? monthFromDate(latestDate) : 0;
  const months = Array.from({ length: 12 }, (_, index) => {
    const budgetAmount = periodizedCategories.reduce((sum, category) => sum + category.periodized[index], 0);
    const actualAmount = periodizedCategories.reduce((sum, category) => sum + category.actual[index], 0);
    return {
      month: index + 1,
      label: MONTH_LABELS[index],
      budget: budgetAmount,
      actual: roundSek(actualAmount),
      variance: actualAmount - budgetAmount
    };
  });

  return { categories: periodizedCategories, months, historicalYears, latestMonth };
}

export function getAvailableYears(dataset: AccountingDataset): number[] {
  return Array.from(new Set(dataset.vouchers.map((voucher) => yearFromDate(voucher.date)))).sort((a, b) => a - b);
}

export function getAvailableAccounts(dataset: AccountingDataset): string[] {
  return getAccountActivity(dataset).map((item) => item.account);
}

export function getAccountActivity(dataset: AccountingDataset): AccountActivity[] {
  const latestYear = getAvailableYears(dataset).at(-1);
  const result = new Map<string, number>();
  for (const account of dataset.accounts.keys()) result.set(account, 0);
  for (const voucher of dataset.vouchers) {
    const voucherYear = yearFromDate(voucher.date);
    for (const transaction of voucher.transactions) {
      if (!result.has(transaction.account)) result.set(transaction.account, 0);
      if (voucherYear === latestYear) {
        result.set(transaction.account, (result.get(transaction.account) ?? 0) + comparisonAmount(transaction));
      }
    }
  }

  return Array.from(result.entries())
    .map(([account, amount]) => ({
      account,
      name: dataset.accounts.get(account)?.name ?? "Okänt konto",
      latestResult: roundSek(amount)
    }))
    .sort((left, right) => Math.abs(right.latestResult) - Math.abs(left.latestResult) || left.account.localeCompare(right.account, "sv", { numeric: true }));
}

export function getAvailableMonths(dataset: AccountingDataset): number[] {
  return Array.from(new Set(dataset.vouchers.map((voucher) => monthFromDate(voucher.date)))).sort((a, b) => a - b);
}

export function formatMonth(month: number): string {
  return MONTH_LABELS[month - 1] ?? String(month).padStart(2, "0");
}

function accountMatches(account: string, selectedAccounts: Set<string>): boolean {
  return selectedAccounts.has(account);
}

export function buildAccountComparison(
  dataset: AccountingDataset,
  selectedAccounts: string[]
): AccountComparisonMonth[] {
  const selected = new Set(selectedAccounts);
  const years = getAvailableYears(dataset);
  const months = getAvailableMonths(dataset);
  const totals = new Map<string, number>();

  for (const voucher of dataset.vouchers) {
    const year = yearFromDate(voucher.date);
    for (const transaction of voucher.transactions) {
      if (!accountMatches(transaction.account, selected)) continue;
      const key = `${year}-${monthFromDate(voucher.date)}`;
      totals.set(key, (totals.get(key) ?? 0) + comparisonAmount(transaction));
    }
  }

  return months.map((month) => ({
    month: String(month).padStart(2, "0"),
    label: formatMonth(month),
    years: Object.fromEntries(years.map((year) => [String(year), roundSek(totals.get(`${year}-${month}`) ?? 0)]))
  }));
}

export function buildAccountCategoryComparison(
  dataset: AccountingDataset,
  selectedAccounts: string[],
  categories: AccountCategory[] = ACCOUNT_CATEGORIES
): AccountComparisonCategory[] {
  const selected = new Set(selectedAccounts);
  const years = getAvailableYears(dataset);
  const totals = new Map<string, Record<string, number>>();

  for (const category of categories) {
    totals.set(category.id, Object.fromEntries(years.map((year) => [String(year), 0])));
  }

  for (const voucher of dataset.vouchers) {
    const year = String(yearFromDate(voucher.date));
    for (const transaction of voucher.transactions) {
      if (!accountMatches(transaction.account, selected)) continue;
      const category = getAccountCategory(transaction.account, categories);
      const row = totals.get(category.id);
      if (row) row[year] += comparisonAmount(transaction);
    }
  }

  return categories
    .map((category) => ({
      id: category.id,
      label: category.label,
      years: Object.fromEntries(years.map((year) => [String(year), roundSek(totals.get(category.id)?.[String(year)] ?? 0)]))
    }))
    .filter((category) => Object.values(category.years).some((value) => value !== 0));
}

export function buildAccountTransactions(
  dataset: AccountingDataset,
  selectedAccounts: string[]
): AccountComparisonTransaction[] {
  const selected = new Set(selectedAccounts);
  const years = getAvailableYears(dataset);
  const rows = new Map<string, AccountComparisonTransaction>();

  for (const voucher of dataset.vouchers) {
    const year = String(yearFromDate(voucher.date));
    for (const transaction of voucher.transactions) {
      if (!accountMatches(transaction.account, selected)) continue;
      const text = transaction.text || voucher.text || "(utan text)";
      const key = `${transaction.account}:${voucher.date}:${voucher.series}:${voucher.number}:${text}`;
      const existing = rows.get(key) ?? {
        account: transaction.account,
        accountName: dataset.accounts.get(transaction.account)?.name ?? "Okänt konto",
        date: formatSieDate(voucher.date),
        voucher: `${voucher.series}${voucher.number}`,
        text,
        years: Object.fromEntries(years.map((availableYear) => [String(availableYear), 0]))
      };
      existing.years[year] += comparisonAmount(transaction);
      rows.set(key, existing);
    }
  }

  return Array.from(rows.values()).sort((a, b) =>
    `${a.account} ${a.date} ${a.voucher}`.localeCompare(`${b.account} ${b.date} ${b.voucher}`, "sv", { numeric: true })
  );
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
  comparisonMode: ComparisonMode = "fullYear",
  categories: AccountCategory[] = ACCOUNT_CATEGORIES
): CategorySummary[] {
  const summary = new Map<string, CategorySummary>();
  const previousCutoff = comparisonCutoffDate(dataset, selectedYear, comparisonMode);

  for (const category of categories) {
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

      const category = getAccountCategory(transaction.account, categories);
      const row = summary.get(category.id);
      if (!row) continue;

      const signed = comparisonAmount(transaction);
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

export function buildCategoryAccountSummary(
  dataset: AccountingDataset,
  selectedYear: number,
  comparisonMode: ComparisonMode,
  categoryId: string,
  categories: AccountCategory[] = ACCOUNT_CATEGORIES
): CategoryAccountSummary[] {
  const summary = new Map<string, CategoryAccountSummary>();
  const previousCutoff = comparisonCutoffDate(dataset, selectedYear, comparisonMode);

  for (const voucher of dataset.vouchers) {
    const year = yearFromDate(voucher.date);
    if (year !== selectedYear && year !== selectedYear - 1) continue;
    if (year === selectedYear - 1 && previousCutoff && voucher.date > previousCutoff) continue;

    for (const transaction of voucher.transactions) {
      if (!classifyResultTransaction(transaction)) continue;
      if (getAccountCategory(transaction.account, categories).id !== categoryId) continue;

      const row = summary.get(transaction.account) ?? {
        account: transaction.account,
        name: dataset.accounts.get(transaction.account)?.name ?? "Okänt konto",
        amount: 0,
        previousAmount: 0
      };
      const signed = comparisonAmount(transaction);
      if (year === selectedYear) row.amount += signed;
      if (year === selectedYear - 1) row.previousAmount += signed;
      summary.set(transaction.account, row);
    }
  }

  return Array.from(summary.values())
    .map((row) => ({ ...row, amount: roundSek(row.amount), previousAmount: roundSek(row.previousAmount) }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.account.localeCompare(b.account, "sv", { numeric: true }));
}

export function buildMonthlyCategorySummary(
  dataset: AccountingDataset,
  selectedYear: number,
  month: number,
  categories: AccountCategory[] = ACCOUNT_CATEGORIES
): MonthlyCategorySummary[] {
  const summary = new Map<string, MonthlyCategorySummary>();
  for (const category of categories) {
    summary.set(category.id, { id: category.id, label: category.label, amount: 0 });
  }

  for (const voucher of dataset.vouchers) {
    if (yearFromDate(voucher.date) !== selectedYear || monthFromDate(voucher.date) !== month) continue;
    for (const transaction of voucher.transactions) {
      if (!classifyResultTransaction(transaction)) continue;
      const category = getAccountCategory(transaction.account, categories);
      const row = summary.get(category.id);
      if (row) row.amount += comparisonAmount(transaction);
    }
  }

  return Array.from(summary.values())
    .map((row) => ({ ...row, amount: roundSek(row.amount) }))
    .filter((row) => row.amount !== 0)
    .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount));
}

export function buildMonthlyCategoryTransactions(
  dataset: AccountingDataset,
  selectedYear: number,
  month: number,
  categoryId: string,
  categories: AccountCategory[] = ACCOUNT_CATEGORIES
): MonthlyCategoryTransaction[] {
  const rows: MonthlyCategoryTransaction[] = [];
  for (const voucher of dataset.vouchers) {
    if (yearFromDate(voucher.date) !== selectedYear || monthFromDate(voucher.date) !== month) continue;
    for (const transaction of voucher.transactions) {
      if (!classifyResultTransaction(transaction) || getAccountCategory(transaction.account, categories).id !== categoryId) continue;
      rows.push({
        sourceYear: yearFromDate(voucher.date),
        account: transaction.account,
        accountName: dataset.accounts.get(transaction.account)?.name ?? "Okänt konto",
        date: formatSieDate(voucher.date),
        voucher: `${voucher.series}${voucher.number}`,
        text: transaction.text || voucher.text || "(utan text)",
        amount: roundSek(comparisonAmount(transaction))
      });
    }
  }
  return rows.sort((left, right) => `${left.date} ${left.voucher} ${left.account}`.localeCompare(`${right.date} ${right.voucher} ${right.account}`, "sv", { numeric: true }));
}

export function buildLiquidityCategorySummary(
  dataset: AccountingDataset,
  selectedYear: number,
  month: number,
  forecastMode: CashForecastMode,
  categories: AccountCategory[] = ACCOUNT_CATEGORIES
): MonthlyCategorySummary[] {
  const summary = new Map<string, MonthlyCategorySummary>();
  for (const category of categories) summary.set(category.id, { id: category.id, label: category.label, amount: 0 });

  for (const voucher of dataset.vouchers) {
    if (!liquidityVoucherIncluded(dataset, voucher, selectedYear, month, forecastMode)) continue;
    for (const transaction of voucher.transactions) {
      if (!classifyResultTransaction(transaction)) continue;
      const row = summary.get(getAccountCategory(transaction.account, categories).id);
      if (row) row.amount += comparisonAmount(transaction);
    }
  }

  return Array.from(summary.values())
    .map((row) => ({ ...row, amount: roundSek(row.amount) }))
    .filter((row) => row.amount !== 0)
    .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount));
}

export function buildLiquidityCategoryTransactions(
  dataset: AccountingDataset,
  selectedYear: number,
  month: number,
  categoryId: string,
  forecastMode: CashForecastMode,
  categories: AccountCategory[] = ACCOUNT_CATEGORIES
): MonthlyCategoryTransaction[] {
  const rows: MonthlyCategoryTransaction[] = [];
  for (const voucher of dataset.vouchers) {
    if (!liquidityVoucherIncluded(dataset, voucher, selectedYear, month, forecastMode)) continue;
    for (const transaction of voucher.transactions) {
      if (!classifyResultTransaction(transaction) || getAccountCategory(transaction.account, categories).id !== categoryId) continue;
      rows.push({
        sourceYear: yearFromDate(voucher.date),
        account: transaction.account,
        accountName: dataset.accounts.get(transaction.account)?.name ?? "Okänt konto",
        date: formatSieDate(voucher.date),
        voucher: `${voucher.series}${voucher.number}`,
        text: transaction.text || voucher.text || "(utan text)",
        amount: roundSek(comparisonAmount(transaction))
      });
    }
  }
  return rows.sort((left, right) => `${left.date} ${left.voucher} ${left.account}`.localeCompare(`${right.date} ${right.voucher} ${right.account}`, "sv", { numeric: true }));
}

function cashOpeningBalance(dataset: AccountingDataset): number {
  return dataset.openingBalances
    .filter((balance) => balance.yearIndex === 0 && CASH_ACCOUNTS.has(balance.account))
    .reduce((sum, balance) => sum + balance.amount, 0);
}

export function getCashOpeningBalance(dataset: AccountingDataset): number {
  return roundSek(cashOpeningBalance(dataset));
}

function isEndOfMonth(date: string): boolean {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  return day === new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthFractionForDate(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day / daysInMonth;
}

export function buildCashForecast(
  dataset: AccountingDataset,
  selectedYear: number,
  forecastMode: CashForecastMode = "latestDate"
): CashPoint[] {
  const opening = cashOpeningBalance(dataset);
  const monthlyActualFlow = new Map<string, number>();
  const actualFlowThroughLatestDate = new Map<string, number>();
  const previousYearFlow = new Map<number, number>();
  const latestDate = latestVoucherDateForYear(dataset, selectedYear);
  const latestMonth = latestDate ? monthFromDate(latestDate) : 0;
  const previousCutoff = latestDate ? `${selectedYear - 1}${latestDate.slice(4)}` : undefined;
  const previousYearFlowThroughCutoff = new Map<number, number>();

  for (const voucher of dataset.vouchers) {
    const year = yearFromDate(voucher.date);
    const month = monthFromDate(voucher.date);
    const cashFlow = voucher.transactions
      .filter((transaction) => CASH_ACCOUNTS.has(transaction.account))
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    if (year === selectedYear) {
      monthlyActualFlow.set(monthKey(year, month), (monthlyActualFlow.get(monthKey(year, month)) ?? 0) + cashFlow);
      if (latestDate && voucher.date <= latestDate) {
        actualFlowThroughLatestDate.set(monthKey(year, month), (actualFlowThroughLatestDate.get(monthKey(year, month)) ?? 0) + cashFlow);
      }
    }

    if (year === selectedYear - 1) {
      previousYearFlow.set(month, (previousYearFlow.get(month) ?? 0) + cashFlow);
      if (previousCutoff && voucher.date <= previousCutoff) {
        previousYearFlowThroughCutoff.set(month, (previousYearFlowThroughCutoff.get(month) ?? 0) + cashFlow);
      }
    }
  }

  let actualBalance = opening;
  let forecastBalance = opening;

  return MONTH_LABELS.map((label, index) => {
    const month = index + 1;
    const actualFlow = monthlyActualFlow.get(monthKey(selectedYear, month)) ?? 0;
    const actualFlowToDate = actualFlowThroughLatestDate.get(monthKey(selectedYear, month)) ?? 0;
    const isPartialLatestMonth = Boolean(latestDate && month === latestMonth && !isEndOfMonth(latestDate));

    if (month < latestMonth || (month === latestMonth && forecastMode === "latestDate" && !isPartialLatestMonth)) {
      actualBalance += actualFlow;
      forecastBalance = actualBalance;
      return {
        month: String(month).padStart(2, "0"),
        label,
        actual: roundSek(actualBalance),
        forecast: null,
        actualFraction: 1
      };
    }

    if (month === latestMonth && forecastMode === "latestDate" && isPartialLatestMonth) {
      actualBalance += actualFlowToDate;
      const previousMonthFlow = previousYearFlow.get(month) ?? 0;
      const previousFlowToCutoff = previousYearFlowThroughCutoff.get(month) ?? 0;
      forecastBalance = actualBalance + (previousMonthFlow - previousFlowToCutoff);
      return {
        month: String(month).padStart(2, "0"),
        label,
        actual: roundSek(actualBalance),
        forecast: roundSek(forecastBalance),
        actualFraction: monthFractionForDate(latestDate!)
      };
    }

    forecastBalance += previousYearFlow.get(month) ?? 0;
    return {
      month: String(month).padStart(2, "0"),
      label,
      actual: null,
      forecast: roundSek(forecastBalance),
      actualFraction: 0
    };
  });
}

export function buildProjectedResult(
  dataset: AccountingDataset,
  selectedYear: number,
  forecastMode: CashForecastMode = "latestDate"
): number {
  const openingBalance = cashOpeningBalance(dataset);
  const forecast = buildCashForecast(dataset, selectedYear, forecastMode);
  const projectedClosingBalance = [...forecast].reverse().find((point) => point.forecast !== null)?.forecast
    ?? [...forecast].reverse().find((point) => point.actual !== null)?.actual
    ?? openingBalance;
  return roundSek(projectedClosingBalance - openingBalance);
}

export function formatSek(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "SEK"
  }).format(value);
}

export function formatThousands(value: number): string {
  const showDecimals = Math.abs(value) < 1000;
  const displayValue = Math.abs(value) < 5 ? 0 : value / 1000;
  return `${new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0
  }).format(displayValue)} tkr`;
}
