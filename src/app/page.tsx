"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, Bot, CalendarRange, Download, Landmark, LineChart } from "lucide-react";
import { ComparisonToggle } from "@/app/report-controls";
import { SortableTable } from "@/app/sortable-table";
import {
  buildMonthlyReport,
  comparisonCutoffDate,
  comparisonModeLabel,
  emptyAccountingDataset,
  formatSieDate,
  formatThousands,
  getAvailableYears,
  loadAccountingDataset,
  parseComparisonMode
} from "@/lib/reports/accounting";
import { useUploads } from "@/app/upload-context";
import type { AccountingDataset } from "@/lib/sie/types";
import styles from "./page.module.css";

function percentChange(current: number, previous: number): string {
  if (!previous) return "Nytt jämförelsetal";
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? "+" : ""}${Math.round(change)}% mot föregående år`;
}

function MonthlyReportPageContent() {
  const params = useSearchParams();
  const { files } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());
  useEffect(() => {
    loadAccountingDataset(files).then(setDataset);
  }, [files]);
  const comparisonMode = parseComparisonMode(params.get("comparison") ?? undefined);
  const comparisonQuery = `?comparison=${comparisonMode}`;
  const years = getAvailableYears(dataset);
  const selectedYear = years.at(-1) ?? 2026;
  const monthlyRows = buildMonthlyReport(dataset, selectedYear, comparisonMode);
  const cutoff = comparisonCutoffDate(dataset, selectedYear, comparisonMode);
  const comparisonLabel = comparisonModeLabel(comparisonMode);
  const currentIncome = monthlyRows.reduce((sum, row) => sum + row.income, 0);
  const currentCosts = monthlyRows.reduce((sum, row) => sum + row.costs, 0);
  const currentResult = currentIncome - currentCosts;
  const previousIncome = monthlyRows.reduce((sum, row) => sum + row.previousYearIncome, 0);
  const previousCosts = monthlyRows.reduce((sum, row) => sum + row.previousYearCosts, 0);
  const previousResult = previousIncome - previousCosts;
  const maxBar = Math.max(
    ...monthlyRows.flatMap((row) => [
      row.income,
      row.costs,
      row.previousYearIncome,
      row.previousYearCosts
    ]),
    1
  );
  const actualMonths = monthlyRows.filter((row) => row.income !== 0 || row.costs !== 0).length;

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
          <a className={styles.active} href="/">
            <BarChart3 size={18} aria-hidden="true" />
            Månadsöversikt
          </a>
          <a href={`/reports/liquidity${comparisonQuery}`}>
            <LineChart size={18} aria-hidden="true" />
            Likviditet
          </a>
          <a href={`/reports/categories${comparisonQuery}`}>
            <CalendarRange size={18} aria-hidden="true" />
            Kategorier
          </a>
          <a href="/chat">
            <Bot size={18} aria-hidden="true" />
            Chat
          </a>
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>{dataset.organizationName}</p>
            <h1>Månadsöversikt {selectedYear}</h1>
            <span className={styles.fileStatus}>
              {dataset.files.length} SIE4-filer inlästa, senaste verifikation {dataset.latestVoucherDate}
            </span>
          </div>
          <div className={styles.actions}>
            <ComparisonToggle
              activeMode={comparisonMode}
              basePath="/"
              cutoffLabel={cutoff ? `Jämför t.o.m. ${formatSieDate(cutoff)}` : undefined}
            />
            <button type="button" title="Exportera aktuell styrelsevy">
              <Download size={18} aria-hidden="true" />
              Excel
            </button>
          </div>
        </header>

        <section className={styles.kpis} aria-label="Nyckeltal">
          <article>
            <span>Intäkter hittills</span>
            <strong>{formatThousands(currentIncome)}</strong>
            <small>{percentChange(currentIncome, previousIncome)}</small>
          </article>
          <article>
            <span>Kostnader hittills</span>
            <strong>{formatThousands(currentCosts)}</strong>
            <small>{percentChange(currentCosts, previousCosts)}</small>
          </article>
          <article>
            <span>Resultat</span>
            <strong>{formatThousands(currentResult)}</strong>
            <small>{percentChange(currentResult, previousResult)}</small>
          </article>
          <article>
            <span>Period</span>
            <strong>{actualMonths}/12 mån</strong>
            <small>Diagrammet visar hela året</small>
          </article>
        </section>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
            <span>Resultat per månad</span>
              <h2>Intäkter och kostnader jämfört med {comparisonLabel.toLowerCase()}</h2>
            </div>
            <select aria-label="Välj år" defaultValue={selectedYear}>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year} mot {year - 1}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.legend} aria-label="Diagramförklaring">
            <span>
              <i className={styles.incomeDot} /> Intäkter {selectedYear}
            </span>
            <span>
              <i className={styles.incomePreviousDot} /> Intäkter {selectedYear - 1}
            </span>
            <span>
              <i className={styles.costDot} /> Kostnader {selectedYear}
            </span>
            <span>
              <i className={styles.costPreviousDot} /> Kostnader {selectedYear - 1}
            </span>
          </div>

          <div
            className={styles.yearChart}
            style={{ gridTemplateColumns: `repeat(${monthlyRows.length}, minmax(38px, 1fr))` }}
            aria-label="Helårsdiagram över intäkter och kostnader"
          >
            {monthlyRows.map((row) => (
              <div className={styles.month} key={row.month}>
                <div className={styles.comparisonBars}>
                  <span
                    title={`Intäkter ${selectedYear}: ${formatThousands(row.income)}`}
                    style={{ height: `${Math.max((row.income / maxBar) * 100, row.income ? 2 : 0)}%` }}
                    className={styles.income}
                  />
                  <span
                    title={`Intäkter ${selectedYear - 1}: ${formatThousands(row.previousYearIncome)}`}
                    style={{
                      height: `${Math.max((row.previousYearIncome / maxBar) * 100, row.previousYearIncome ? 2 : 0)}%`
                    }}
                    className={styles.incomePrevious}
                  />
                  <span
                    title={`Kostnader ${selectedYear}: ${formatThousands(row.costs)}`}
                    style={{ height: `${Math.max((row.costs / maxBar) * 100, row.costs ? 2 : 0)}%` }}
                    className={styles.cost}
                  />
                  <span
                    title={`Kostnader ${selectedYear - 1}: ${formatThousands(row.previousYearCosts)}`}
                    style={{
                      height: `${Math.max((row.previousYearCosts / maxBar) * 100, row.previousYearCosts ? 2 : 0)}%`
                    }}
                    className={styles.costPrevious}
                  />
                </div>
                <strong>{row.label}</strong>
              </div>
            ))}
          </div>

          <SortableTable
            columns={[
              { key: "month", label: "Månad", format: "text", summable: false },
              { key: "income", label: `Intäkter ${selectedYear}`, format: "thousands", tone: "income" },
              { key: "previousYearIncome", label: `Intäkter ${selectedYear - 1}`, format: "thousands", tone: "income" },
              { key: "costs", label: `Kostnader ${selectedYear}`, format: "thousands", tone: "cost" },
              { key: "previousYearCosts", label: `Kostnader ${selectedYear - 1}`, format: "thousands", tone: "cost" },
              { key: "result", label: `Resultat ${selectedYear}`, format: "thousands", tone: "result" },
              { key: "previousYearResult", label: `Resultat ${selectedYear - 1}`, format: "thousands", tone: "result" }
            ]}
            rows={monthlyRows.map((row) => ({
              month: row.label,
              income: row.income,
              previousYearIncome: row.previousYearIncome,
              costs: row.costs,
              previousYearCosts: row.previousYearCosts,
              result: row.result,
              previousYearResult: row.previousYearResult
            }))}
            title="Månadsdata"
            wide
          />
        </article>
      </section>
    </main>
  );
}

export default function MonthlyReportPage() {
  return (
    <Suspense fallback={<main style={{ padding: 32 }}>Laddar rapport...</main>}>
      <MonthlyReportPageContent />
    </Suspense>
  );
}
