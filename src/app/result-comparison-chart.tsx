"use client";

import { formatThousands } from "@/lib/reports/accounting";
import type { ResultCurvePoint } from "@/lib/reports/result-forecast";
import styles from "./page.module.css";

const months = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

export function ResultComparisonChart({ reference, referenceLabel, actual, forecast, shade = false }: {
  reference: ResultCurvePoint[]; referenceLabel: string; actual: ResultCurvePoint[]; forecast: ResultCurvePoint[]; shade?: boolean;
}) {
  const values = [0, ...reference.map((point) => point.amount), ...actual.map((point) => point.amount), ...forecast.map((point) => point.amount)];
  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const x = (month: number) => 80 + month / 12 * 900;
  const y = (amount: number) => 205 - (amount - min) / (max - min) * 180;
  const coords = (points: ResultCurvePoint[]) => points.map((point) => `${x(point.month)},${y(point.amount)}`).join(" ");
  const ticks = [...new Set([...Array.from({ length: 5 }, (_, index) => max - (max - min) * index / 4), 0])];
  const referenceAt = (month: number) => {
    const right = reference.find((point) => point.month >= month);
    if (!right) return reference.at(-1)?.amount ?? 0;
    const left = reference.filter((point) => point.month < month).at(-1) ?? { month: 0, amount: 0 };
    return left.amount + (right.amount - left.amount) * (month - left.month) / (right.month - left.month);
  };
  return <div className={styles.cumulativeChart}><svg viewBox="0 0 1000 245" role="img" aria-label="Resultat hittills, jämförelse och prognos till årsslut">
    {ticks.map((amount, index) => <g key={index}><line className={amount === 0 ? styles.cumulativeZeroLine : styles.cumulativeGridLine} x1="80" x2="980" y1={y(amount)} y2={y(amount)} /><text className={styles.cumulativeValueLabel} x="72" y={y(amount) + 4} textAnchor="end">{formatThousands(amount)}</text></g>)}
    {shade && reference.length ? actual.slice(1).map((point, index) => {
      const previous = actual[index];
      const leftBudget = referenceAt(previous.month);
      const rightBudget = referenceAt(point.month);
      const leftVariance = previous.amount - leftBudget;
      const rightVariance = point.amount - rightBudget;
      const polygon = (a: ResultCurvePoint, b: ResultCurvePoint, aBudget: number, bBudget: number, favorable: boolean, key: string) => <polygon key={key} className={favorable ? styles.cumulativeFavorableArea : styles.cumulativeUnfavorableArea} points={`${x(a.month)},${y(aBudget)} ${x(b.month)},${y(bBudget)} ${x(b.month)},${y(b.amount)} ${x(a.month)},${y(a.amount)}`} />;
      if (leftVariance * rightVariance < 0) {
        const fraction = leftVariance / (leftVariance - rightVariance);
        const intersection = { month: previous.month + (point.month - previous.month) * fraction, amount: previous.amount + (point.amount - previous.amount) * fraction };
        return <g key={index}>{polygon(previous, intersection, leftBudget, intersection.amount, leftVariance >= 0, "left")}{polygon(intersection, point, intersection.amount, rightBudget, rightVariance >= 0, "right")}</g>;
      }
      return polygon(previous, point, leftBudget, rightBudget, leftVariance + rightVariance >= 0, String(index));
    }) : null}
    <polyline className={styles.cumulativeBudgetLine} points={coords(reference)} />
    <polyline className={styles.cumulativeActualLine} points={coords(actual)} />
    <polyline className={styles.cumulativeForecastLine} points={coords(forecast)} />
    {months.map((label, index) => <text key={label} className={styles.cumulativeMonthLabel} x={x(index + 1)} y="236" textAnchor="middle">{label}</text>)}
    {reference.map((point) => <circle key={point.month} className={styles.cumulativeBudgetPoint} cx={x(point.month)} cy={y(point.amount)} r="4"><title>{referenceLabel}: {formatThousands(point.amount)}</title></circle>)}
    {actual.map((point) => <circle key={point.month} className={styles.cumulativeActualPoint} cx={x(point.month)} cy={y(point.amount)} r="4"><title>Faktiskt resultat: {formatThousands(point.amount)}</title></circle>)}
    {forecast.slice(1).map((point) => <circle key={point.month} className={styles.cumulativeForecastPoint} cx={x(point.month)} cy={y(point.amount)} r="4"><title>Prognostiserat resultat {months[Math.ceil(point.month) - 1]}: {formatThousands(point.amount)}</title></circle>)}
  </svg></div>;
}
