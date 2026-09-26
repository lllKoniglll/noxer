"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, Bot, CalendarRange, FileUp, Landmark, LineChart, WalletCards } from "lucide-react";
import Link from "next/link";
import { SortableTable } from "@/app/sortable-table";
import {
  buildCashForecast,
  buildProjectedResult,
  formatThousands,
  getAvailableYears,
  loadAccountingDataset,
  emptyAccountingDataset,
  type CashForecastMode,
  formatMonth,
  parseComparisonMode
} from "@/lib/reports/accounting";
import { useUploads } from "@/app/upload-context";
import { LogoutLink } from "@/app/logout-link";
import type { AccountingDataset } from "@/lib/sie/types";
import styles from "../../page.module.css";

function LiquidityReportPageContent() {
  const params = useSearchParams();
  const { files } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());
  const [forecastMode, setForecastMode] = useState<CashForecastMode>("latestDate");
  useEffect(() => { loadAccountingDataset(files).then(setDataset); }, [files]);
  const comparisonMode = parseComparisonMode(params.get("comparison") ?? undefined);
  const comparisonQuery = `?comparison=${comparisonMode}`;
  const years = getAvailableYears(dataset);
  const selectedYear = years.at(-1) ?? 2026;
  const cashForecast = buildCashForecast(dataset, selectedYear, forecastMode);
  const latestActualCash = [...cashForecast].reverse().find((point) => point.actual !== null)?.actual ?? 0;
  const forecastEnd = [...cashForecast].reverse().find((point) => point.forecast !== null)?.forecast;
  const maxCash = Math.max(...cashForecast.flatMap((point) => [point.actual ?? 0, point.forecast ?? 0]), 1);
  const actualMonths = cashForecast.filter((point) => point.actual !== null).length;
  const latestActualMonth = [...cashForecast].reverse().find((point) => point.actual !== null)?.label;
  const projectedResult = buildProjectedResult(dataset, selectedYear, forecastMode);

  if (!files.length) {
    return <main style={{ padding: 32 }}><h1>Ladda upp en SIE4-fil för att börja</h1><p>Uppladdade filer sparas lokalt i den här webbläsaren.</p></main>;
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Rapporter">
        <div className={styles.brand}>
          <Landmark size={26} aria-hidden="true" />
          <div>
            <strong>Kronängs IF</strong>
            <span>Styrelserapport</span>
          </div>
        </div>
        <nav className={styles.nav}>
          <Link href="/"><BarChart3 size={18} aria-hidden="true" />Översikt</Link>
          <Link href={`/reports/monthly${comparisonQuery}`}>
            <BarChart3 size={18} aria-hidden="true" />
            Månadsöversikt
          </Link>
          <Link className={styles.active} href="/reports/liquidity">
            <LineChart size={18} aria-hidden="true" />
            Likviditet
          </Link>
          <Link href={`/reports/categories${comparisonQuery}`}>
            <CalendarRange size={18} aria-hidden="true" />
            Kategorier
          </Link>
          <Link href="/reports/accounts">
            <BarChart3 size={18} aria-hidden="true" />
            Kontojämförelse
          </Link>
          <Link href="/reports/budget"><WalletCards size={18} aria-hidden="true" />Budget</Link>
          <Link href="/chat">
            <Bot size={18} aria-hidden="true" />
            Chat
          </Link>
          <Link href="/files"><FileUp size={18} aria-hidden="true" />Filer</Link>
          <LogoutLink />
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>{dataset.organizationName}</p>
            <h1>Likviditet {selectedYear}</h1>
            <span className={styles.fileStatus}>
              Faktiskt till {dataset.latestVoucherDate ?? "saknas"}, {forecastMode === "latestDate" ? "prognos från nästa dag" : "prognos från föregående hela månad"}
            </span>
          </div>
          <div className={styles.actions}>
            <label className={styles.forecastControl}>
              <span>Prognos från</span>
              <select aria-label="Välj när prognosen ska börja" onChange={(event) => setForecastMode(event.target.value as CashForecastMode)} value={forecastMode}>
                <option value="latestDate">Senaste datum ({dataset.latestVoucherDate ? `${formatMonth(Number(dataset.latestVoucherDate.slice(4, 6)))} ${dataset.latestVoucherDate.slice(6, 8)}` : "saknas"})</option>
                <option value="fullMonth">Föregående hela månad</option>
              </select>
            </label>
          </div>
        </header>

        <section className={styles.kpis} aria-label="Likviditetsnyckeltal">
          <article>
            <span>Senast faktiskt</span>
            <strong>{formatThousands(latestActualCash)}</strong>
            <small>Bank- och kassakonton</small>
          </article>
          <article>
            <span>Prognos årsslut</span>
            <strong>{forecastEnd ? formatThousands(forecastEnd) : "saknas"}</strong>
            <small>Baserad på föregående år</small>
          </article>
          <article>
            <span>Faktisk period</span>
            <strong>{actualMonths}/12 mån</strong>
            <small>Utfall t.o.m. {latestActualMonth ?? "saknas"}</small>
          </article>
          <article>
            <span>Prognostiserat resultat</span>
            <strong>{formatThousands(projectedResult)}</strong>
            <small>Prognos saldo 31 dec − saldo 1 jan</small>
          </article>
        </section>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Likviditetsanalys</span>
              <h2>Faktiskt plus prognos för hela året</h2>
            </div>
          </div>
          <div className={styles.legend} aria-label="Diagramförklaring">
            <span><i className={styles.actualDot} /> Faktiskt saldo</span>
            <span><i className={styles.forecastDot} /> Prognos</span>
          </div>
          <div
            className={styles.cashChart}
            style={{ gridTemplateColumns: `repeat(${cashForecast.length}, minmax(64px, 1fr))` }}
          >
            {cashForecast.map((point) => {
              const value = point.forecast ?? point.actual ?? 0;
              const actualFraction = point.actualFraction ?? (point.actual !== null ? 1 : 0);
              const barBackground = actualFraction >= 1
                ? "var(--cash)"
                : actualFraction <= 0
                  ? "var(--forecast)"
                  : `linear-gradient(to top, var(--cash) 0%, var(--cash) ${actualFraction * 100}%, var(--forecast) ${actualFraction * 100}%, var(--forecast) 100%)`;
              const tooltip = point.actual !== null && point.forecast !== null
                ? `${point.label}: Faktiskt ${formatThousands(point.actual)} · Prognos ${formatThousands(point.forecast)}`
                : point.actual !== null
                  ? `${point.label}: Faktiskt ${formatThousands(point.actual)}`
                  : `${point.label}: Prognos ${formatThousands(point.forecast ?? 0)}`;
              return (
                <div className={styles.month} key={point.month}>
                  <div className={styles.cashBars}>
                    <span className={styles.cashBarWrap} style={{ height: `${Math.max((value / maxCash) * 100, 2)}%` }}>
                      <span aria-label={tooltip} className={styles.cashBar} style={{ background: barBackground, height: "100%" }} />
                      <span className={styles.cashTooltip} role="tooltip">{tooltip}</span>
                    </span>
                  </div>
                  <strong>{point.label}</strong>
                </div>
              );
            })}
          </div>
          <SortableTable
            columns={[
              { key: "month", label: "Månad", format: "text", summable: false },
              { key: "actual", label: "Faktiskt saldo", format: "thousands", summable: false, tone: "neutral" },
              { key: "forecast", label: "Prognos", format: "thousands", summable: false, tone: "neutral" }
            ]}
            rows={cashForecast.map((point) => ({
              month: point.label,
              actual: point.actual,
              forecast: point.forecast
            }))}
            title="Likviditetsdata"
            wide
          />
        </article>
      </section>
    </main>
  );
}

export default function LiquidityReportPage() {
  return (
    <Suspense fallback={<main style={{ padding: 32 }}>Laddar rapport...</main>}>
      <LiquidityReportPageContent />
    </Suspense>
  );
}
