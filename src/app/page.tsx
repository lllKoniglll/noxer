import { BarChart3, CalendarRange, Download, Landmark, LineChart } from "lucide-react";
import { ComparisonToggle } from "@/app/report-controls";
import {
  buildMonthlyReport,
  comparisonCutoffDate,
  comparisonModeLabel,
  formatSieDate,
  formatThousands,
  getAvailableYears,
  loadAccountingDataset,
  parseComparisonMode
} from "@/lib/reports/accounting";
import styles from "./page.module.css";

function percentChange(current: number, previous: number): string {
  if (!previous) return "Nytt jämförelsetal";
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? "+" : ""}${Math.round(change)}% mot föregående år`;
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MonthlyReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const comparisonMode = parseComparisonMode(params?.comparison);
  const comparisonQuery = `?comparison=${comparisonMode}`;
  const dataset = await loadAccountingDataset();
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

          <table className={styles.table}>
            <thead>
              <tr>
                <th>Månad</th>
                <th>Intäkter {selectedYear}</th>
                <th>Intäkter {selectedYear - 1}</th>
                <th>Kostnader {selectedYear}</th>
                <th>Kostnader {selectedYear - 1}</th>
                <th>Resultat {selectedYear}</th>
                <th>Resultat {selectedYear - 1}</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((row) => (
                <tr key={row.month}>
                  <td>{row.label}</td>
                  <td>{formatThousands(row.income)}</td>
                  <td>{formatThousands(row.previousYearIncome)}</td>
                  <td>{formatThousands(row.costs)}</td>
                  <td>{formatThousands(row.previousYearCosts)}</td>
                  <td>{formatThousands(row.result)}</td>
                  <td>{formatThousands(row.previousYearResult)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </main>
  );
}
