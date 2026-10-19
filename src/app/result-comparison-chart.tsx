"use client";

import { formatThousands } from "@/lib/reports/accounting";
import { useEffect, useId, useRef, useState } from "react";
import type { ResultCurvePoint } from "@/lib/reports/result-forecast";
import styles from "./page.module.css";

const months = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

export function ResultComparisonChart({ reference, referenceLabel, referenceYear, year, periodEnd, actual, forecast, shade = false }: {
  reference: ResultCurvePoint[]; referenceLabel: string; referenceYear: number; year: number; periodEnd: string; actual: ResultCurvePoint[]; forecast: ResultCurvePoint[]; shade?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [active, setActive] = useState<{ series: string; month: number } | null>(null);
  const tooltipId = useId();
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(entry.contentRect.width, 300)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const values = [0, ...reference.map((point) => point.amount), ...actual.map((point) => point.amount), ...forecast.map((point) => point.amount)];
  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const x = (month: number) => 80 + month / 12 * (width - 104);
  const y = (amount: number) => 240 - (amount - min) / (max - min) * 215;
  const coords = (points: ResultCurvePoint[]) => points.map((point) => `${x(point.month)},${y(point.amount)}`).join(" ");
  const formatDate = (date: string) => `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  const pointDate = (point: ResultCurvePoint, pointYear: number) => point.month === 0 ? `Årets början · ${pointYear}-01-01` : point.date ? formatDate(point.date) : formatDate(`${pointYear}${String(Math.ceil(point.month)).padStart(2, "0")}${new Date(Date.UTC(pointYear, Math.ceil(point.month), 0)).getUTCDate()}`);
  const periodMonth = Number(periodEnd.slice(4, 6));
  const periodDay = Number(periodEnd.slice(6, 8));
  const periodPosition = periodMonth - 1 + periodDay / new Date(Date.UTC(year, periodMonth, 0)).getUTCDate();
  const markerX = x(periodPosition);
  const markerLabelWidth = 190;
  const markerLabelX = Math.min(Math.max(markerX - markerLabelWidth / 2, 80), width - markerLabelWidth - 10);
  const series = [
    { id: "reference", label: referenceLabel, points: reference, year: referenceYear, className: styles.cumulativeBudgetPoint },
    { id: "actual", label: "Faktiskt resultat", points: actual, year, className: styles.cumulativeActualPoint },
    { id: "forecast", label: "Prognostiserat resultat", points: forecast.slice(1), year, className: styles.cumulativeForecastPoint }
  ];
  const activeSeries = series.find((entry) => entry.id === active?.series);
  const activePoint = activeSeries?.points.find((point) => point.month === active?.month);
  const amount = (value: number) => `${new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} kr`;
  const ticks = [...new Set([...Array.from({ length: 5 }, (_, index) => max - (max - min) * index / 4), 0])];
  const referenceAt = (month: number) => {
    const right = reference.find((point) => point.month >= month);
    if (!right) return reference.at(-1)?.amount ?? 0;
    if (right.month === month) return right.amount;
    const left = reference.filter((point) => point.month < month).at(-1) ?? { month: 0, amount: 0 };
    return left.amount + (right.amount - left.amount) * (month - left.month) / (right.month - left.month);
  };
  return <div className={styles.cumulativeChart} ref={container} onMouseLeave={() => setActive(null)} onKeyDown={(event) => { if (event.key === "Escape") setActive(null); }}><svg viewBox={`0 0 ${width} 280`} role="img" aria-label="Resultat hittills, jämförelse och prognos till årsslut">
    {ticks.map((amount, index) => <g key={index}><line className={amount === 0 ? styles.cumulativeZeroLine : styles.cumulativeGridLine} x1="80" x2={width - 24} y1={y(amount)} y2={y(amount)} /><text className={styles.cumulativeValueLabel} x="72" y={y(amount) + 4} textAnchor="end">{formatThousands(amount)}</text></g>)}
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
    <g className={styles.comparisonPeriodMarker} aria-label={`Jämförelseperiod till och med ${formatDate(periodEnd)}`}>
      <line x1={markerX} x2={markerX} y1="26" y2="245" />
      <rect x={markerLabelX} y="0" width={markerLabelWidth} height="23" rx="5" />
      <text x={markerLabelX + markerLabelWidth / 2} y="16" textAnchor="middle">Periodslut · {formatDate(periodEnd)}</text>
    </g>
    <polyline className={styles.cumulativeBudgetLine} points={coords(reference)} />
    <polyline className={styles.cumulativeActualLine} points={coords(actual)} />
    <polyline className={styles.cumulativeForecastLine} points={coords(forecast)} />
    <text className={styles.cumulativeMonthLabel} x={x(0)} y="270" textAnchor="middle">1 jan</text>
    {months.map((label, index) => <text key={label} className={styles.cumulativeMonthLabel} x={x(index + 1)} y="270" textAnchor="middle">{label}</text>)}
    {series.flatMap((entry) => entry.points.map((point) => <g key={`${entry.id}-${point.month}`}>
      <circle className={styles.chartPointTarget} cx={x(point.month)} cy={y(point.amount)} r="11" tabIndex={0} role="button" aria-label={`${entry.label}, ${pointDate(point, entry.year)}, ${amount(point.amount)}`} aria-describedby={active?.series === entry.id && active.month === point.month ? tooltipId : undefined} onMouseEnter={() => setActive({ series: entry.id, month: point.month })} onFocus={() => setActive({ series: entry.id, month: point.month })} onBlur={() => setActive(null)} onClick={() => setActive({ series: entry.id, month: point.month })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive({ series: entry.id, month: point.month }); } }} />
      <circle className={`${entry.className} ${point.date && point.month !== 0 ? styles.chartPeriodPoint : ""}`} cx={x(point.month)} cy={y(point.amount)} r={point.date && point.month !== 0 ? 6 : 4} pointerEvents="none" />
    </g>))}
  </svg>{activePoint && activeSeries ? <div id={tooltipId} role="tooltip" className={styles.resultPointTooltip} style={{ left: `${Math.max(8, Math.min(x(activePoint.month) - 120, width - Math.min(260, width - 16)))}px`, top: `${Math.max(35, y(activePoint.amount) - 100)}px` }}><span>{activeSeries.label}</span><strong>{amount(activePoint.amount)}</strong><small>{pointDate(activePoint, activeSeries.year)}</small></div> : null}</div>;
}
