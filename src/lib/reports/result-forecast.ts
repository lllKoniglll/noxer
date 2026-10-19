import type { AccountingDataset } from "../sie/types";

export type ResultCurvePoint = { month: number; amount: number };

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
    const month = Number(cutoff.slice(4, 6));
    const day = Number(cutoff.slice(6, 8));
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let index = 0; index < month; index++) {
      result += actual[index];
      actualPoints.push({ month: index === month - 1 ? index + day / days : index + 1, amount: result });
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
