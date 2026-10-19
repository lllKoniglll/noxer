import type { AccountingDataset, BudgetDataset } from "@/lib/sie/types";
import { ACCOUNT_CATEGORIES, getAccountCategory, type AccountCategory } from "./categories";
import { buildBudgetPeriodization } from "./accounting";
import resultGroups from "./result-groups.json";

export const RESULT_GROUPS: AccountCategory[] = resultGroups;
export type ResultComparison = "budget" | "previousPeriod" | "previousYear";
export type ResultAccount = { account: string; name: string; actual: number; comparison: number; variance: number; months: number[]; comparisonMonths: number[]; hasForecastActivity: boolean };

export function buildResultReport(dataset: AccountingDataset, budget: BudgetDataset | undefined, year: number, cutoff: string, comparison: ResultComparison, categories: AccountCategory[] = RESULT_GROUPS, periodizationCategories: AccountCategory[] = ACCOUNT_CATEGORIES) {
  const latest = dataset.vouchers.filter((voucher) => voucher.date.startsWith(String(year))).map((voucher) => voucher.date).sort().at(-1);
  const forecastCutoff = latest && latest < cutoff ? latest : cutoff;
  const rows = new Map<string, ResultAccount>();
  const getRow = (account: string, name?: string) => {
    if (!rows.has(account)) rows.set(account, { account, name: dataset.accounts.get(account)?.name ?? name ?? "Okänt konto", actual: 0, comparison: 0, variance: 0, months: Array(12).fill(0), comparisonMonths: Array(12).fill(0), hasForecastActivity: false });
    return rows.get(account)!;
  };
  // Match the accounting reports: revenue positive and expenses negative.
  for (const voucher of dataset.vouchers) {
    const voucherYear = Number(voucher.date.slice(0, 4));
    const month = Number(voucher.date.slice(4, 6)) - 1;
    if (month < 0 || month > 11) continue;
    const actual = voucherYear === year && voucher.date <= cutoff;
    const previous = comparison !== "budget" && voucherYear === year - 1 && (comparison === "previousYear" || voucher.date.slice(4) <= cutoff.slice(4));
    const forecast = voucherYear === year - 1 && voucher.date.slice(4) > forecastCutoff.slice(4);
    if (!actual && !previous && !forecast) continue;
    for (const transaction of voucher.transactions) {
      if (!/^[3-8]/.test(transaction.account)) continue;
      const row = getRow(transaction.account);
      if (forecast && transaction.amount !== 0) row.hasForecastActivity = true;
      if (actual) { row.actual -= transaction.amount; row.months[month] -= transaction.amount; }
      if (previous) { row.comparison -= transaction.amount; row.comparisonMonths[month] -= transaction.amount; }
    }
  }
  if (comparison === "budget" && budget?.year === year) {
    // Allocate using the budget page's categories, then regroup the accounts
    // for presentation. Changing report grouping must not change the curve.
    const allocation = buildBudgetPeriodization(dataset, budget, periodizationCategories, "history");
    const sharesByCategory = new Map(allocation.categories.map((category) => [category.id, category.shares]));
    for (const entry of budget.rows) {
      if (!/^[3-8]/.test(entry.account)) continue;
      const row = getRow(entry.account, entry.name);
      row.comparison += entry.amount;
      const shares = sharesByCategory.get(getAccountCategory(entry.account, periodizationCategories).id)!;
      let allocated = 0;
      row.comparisonMonths = row.comparisonMonths.map((amount, month) => {
        const monthlyBudget = month === 11 ? entry.amount - allocated : entry.amount * shares[month];
        allocated += monthlyBudget;
        return amount + monthlyBudget;
      });
    }
  }
  for (const row of rows.values()) row.variance = row.actual - row.comparison;
  const groups = categories.map((category) => {
    const accounts = [...rows.values()].filter((row) => getAccountCategory(row.account, categories).id === category.id)
      .filter((row) => row.hasForecastActivity || row.actual !== 0 || row.comparison !== 0 || row.months.some((amount) => amount !== 0) || row.comparisonMonths.some((amount) => amount !== 0))
      .sort((a, b) => a.account.localeCompare(b.account, "sv", { numeric: true }));
    const actual = accounts.reduce((sum, row) => sum + row.actual, 0);
    const reference = accounts.reduce((sum, row) => sum + row.comparison, 0);
    return { ...category, accounts, actual, comparison: reference, variance: actual - reference };
  }).filter((group) => group.accounts.length > 0);
  return groups;
}
