import type { AccountingDataset } from "../sie/types";
import { periodizedBudgetToDate } from "./accounting";

export type ResultCurvePoint = { month: number; amount: number; date?: string };

export function buildBudgetResultCurve(monthly: number[], year: number, cutoff: string): ResultCurvePoint[] {
  const month = Number(cutoff.slice(4, 6));
  const day = Number(cutoff.slice(6, 8));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let accumulated = 0;
  return [{ month: 0, amount: 0, date: `${year}0101` }, ...monthly.flatMap((amount, index) => {
    const points: ResultCurvePoint[] = [];
    if (index === month - 1 && day < days) points.push({ month: index + day / days, amount: periodizedBudgetToDate(monthly, cutoff), date: cutoff });
    accumulated += amount;
    points.push({ month: index + 1, amount: accumulated, ...(index === month - 1 && day === days ? { date: cutoff } : {}) });
    return points;
  })];
}

export function buildPreviousYearResultCurve(dataset: AccountingDataset, year: number, cutoff: string, accounts: string[]): ResultCurvePoint[] {
  const selected = new Set(accounts);
  const monthly = Array<number>(12).fill(0);
  let throughCutoff = 0;
  for (const voucher of dataset.vouchers) {
    if (!voucher.date.startsWith(String(year - 1))) continue;
    const amount = voucher.transactions.filter((transaction) => /^[3-8]/.test(transaction.account) && selected.has(transaction.account)).reduce((sum, transaction) => sum - transaction.amount, 0);
    monthly[Number(voucher.date.slice(4, 6)) - 1] += amount;
    if (voucher.date.slice(4) <= cutoff.slice(4)) throughCutoff += amount;
  }
  const month = Number(cutoff.slice(4, 6));
  const day = Number(cutoff.slice(6, 8));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const points: ResultCurvePoint[] = [{ month: 0, amount: 0, date: `${year - 1}0101` }];
  let accumulated = 0;
  for (let index = 0; index < 12; index++) {
    accumulated += monthly[index];
    if (index === month - 1 && day < days) {
      points.push({ month: index + day / days, amount: throughCutoff, date: `${year - 1}${cutoff.slice(4)}` });
    }
    points.push({ month: index + 1, amount: accumulated });
  }
  return points;
}

// Forecast results, not bank balances: use last year's remaining income and
// expenses after the same calendar date, as the liquidity forecast does.
export function buildResultForecast(dataset: AccountingDataset, year: number, requestedCutoff?: string, accounts?: string[]) {
  const latest = dataset.vouchers.filter((voucher) => voucher.date.startsWith(String(year))).map((voucher) => voucher.date).sort().at(-1);
  const cutoff = latest && requestedCutoff ? (requestedCutoff < latest ? requestedCutoff : latest) : latest;
  const hasHistory = dataset.vouchers.some((voucher) => voucher.date.startsWith(String(year - 1)));
  const selected = accounts ? new Set(accounts) : null;
  const actual = Array<number>(12).fill(0);
  const remaining = Array<number>(12).fill(0);
  if (cutoff) for (const voucher of dataset.vouchers) {
    const actualVoucher = voucher.date.startsWith(String(year)) && voucher.date <= cutoff;
    const futureVoucher = voucher.date.startsWith(String(year - 1)) && voucher.date.slice(4) > cutoff.slice(4);
    if (!actualVoucher && !futureVoucher) continue;
    const month = Number(voucher.date.slice(4, 6)) - 1;
    for (const transaction of voucher.transactions) {
      if (!/^[3-8]/.test(transaction.account) || (selected && !selected.has(transaction.account))) continue;
      if (actualVoucher) actual[month] -= transaction.amount;
      if (futureVoucher) remaining[month] -= transaction.amount;
    }
  }
  const actualPoints: ResultCurvePoint[] = [];
  const forecastPoints: ResultCurvePoint[] = [];
  let result = 0;
  if (cutoff) {
    actualPoints.push({ month: 0, amount: 0, date: `${year}0101` });
    const month = Number(cutoff.slice(4, 6));
    const day = Number(cutoff.slice(6, 8));
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let index = 0; index < month; index++) {
      result += actual[index];
      actualPoints.push({ month: index === month - 1 ? index + day / days : index + 1, amount: result, ...(index === month - 1 ? { date: cutoff } : {}) });
    }
    if (hasHistory && cutoff.slice(4) !== "1231") {
      forecastPoints.push(actualPoints.at(-1)!);
      for (let index = month - 1; index < 12; index++) {
        result += remaining[index];
        if (index !== month - 1 || day < days) forecastPoints.push({ month: index + 1, amount: result });
      }
    }
  }
  return { cutoff, hasHistory, actualPoints, forecastPoints, projectedResult: cutoff && (hasHistory || cutoff.slice(4) === "1231") ? result : null };
}
