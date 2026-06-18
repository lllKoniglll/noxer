import { BarChart3, CalendarRange, Download, Landmark, LineChart } from "lucide-react";
import {
  buildCashForecast,
  buildCategorySummary,
  buildMonthlyReport,
  formatThousands,
  getAvailableYears,
  loadAccountingDataset
} from "@/lib/reports/accounting";
import styles from "./page.module.css";

function percentChange(current: number, previous: number): string {
  if (!previous) return "Nytt jämförelsetal";
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? "+" : ""}${Math.round(change)}% mot föregående år`;
}

export default async function Home() {
  const dataset = await loadAccountingDataset();
  const years = getAvailableYears(dataset);
  const selectedYear = years.at(-1) ?? 2026;
  const monthlyRows = buildMonthlyReport(dataset, selectedYear);
  const categories = buildCategorySummary(dataset, selectedYear).slice(0, 6);
  const cashForecast = buildCashForecast(dataset, selectedYear);
  const latestActualCash = [...cashForecast].reverse().find((point) => point.actual !== null)?.actual ?? 0;
  const forecastEnd = [...cashForecast].reverse().find((point) => point.forecast !== null)?.forecast;
  const currentIncome = monthlyRows.reduce((sum, row) => sum + row.income, 0);
  const currentCosts = monthlyRows.reduce((sum, row) => sum + row.costs, 0);
  const currentResult = currentIncome - currentCosts;
  const previousResult = monthlyRows.reduce((sum, row) => sum + row.previousYearResult, 0);
  const maxBar = Math.max(...monthlyRows.flatMap((row) => [row.income, row.costs]), 1);
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
          <a className={styles.active} href="#overview">
            <BarChart3 size={18} aria-hidden="true" />
            Månadsöversikt
          </a>
          <a href="#cash">
            <LineChart size={18} aria-hidden="true" />
            Likviditet
          </a>
          <a href="#comparison">
            <CalendarRange size={18} aria-hidden="true" />
            Kategorier
          </a>
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>{dataset.organizationName}</p>
            <h1>Ekonomisk överblick {selectedYear}</h1>
            <span className={styles.fileStatus}>
              {dataset.files.length} SIE4-filer inlästa, senaste verifikation {dataset.latestVoucherDate}
            </span>
          </div>
          <div className={styles.actions}>
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
            <small>{actualMonths} månader med utfall</small>
          </article>
          <article>
            <span>Kostnader hittills</span>
            <strong>{formatThousands(currentCosts)}</strong>
            <small>{percentChange(currentCosts, currentCosts - previousResult)}</small>
          </article>
          <article>
            <span>Resultat</span>
            <strong>{formatThousands(currentResult)}</strong>
            <small>{percentChange(currentResult, previousResult)}</small>
          </article>
          <article>
            <span>Likvida medel</span>
            <strong>{formatThousands(latestActualCash)}</strong>
            <small>Faktiskt till {dataset.latestVoucherDate}</small>
          </article>
        </section>

        <section className={styles.grid}>
          <article className={styles.panel} id="overview">
            <div className={styles.panelHeader}>
              <div>
                <span>Resultat per månad</span>
                <h2>Intäkter och kostnader</h2>
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
                <i className={styles.incomeDot} /> Intäkter
              </span>
              <span>
                <i className={styles.costDot} /> Kostnader
              </span>
            </div>

            <div className={styles.chart} aria-label="Diagram över intäkter och kostnader">
              {monthlyRows.map((row) => (
                <div className={styles.month} key={row.month}>
                  <div className={styles.bars}>
                    <span
                      style={{ height: `${Math.max((row.income / maxBar) * 100, 2)}%` }}
                      className={styles.income}
                    />
                    <span
                      style={{ height: `${Math.max((row.costs / maxBar) * 100, 2)}%` }}
                      className={styles.cost}
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
                  <th>Intäkter</th>
                  <th>Kostnader</th>
                  <th>Resultat</th>
                  <th>{selectedYear - 1}</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map((row) => (
                  <tr key={row.month}>
                    <td>{row.label}</td>
                    <td>{formatThousands(row.income)}</td>
                    <td>{formatThousands(row.costs)}</td>
                    <td>{formatThousands(row.result)}</td>
                    <td>{formatThousands(row.previousYearResult)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <article className={styles.panel} id="cash">
            <div className={styles.panelHeader}>
              <div>
                <span>Likviditetsanalys</span>
                <h2>Faktiskt plus prognos</h2>
              </div>
            </div>
            <div className={styles.cashline}>
              <span className={styles.actual}>Faktiskt</span>
              <span className={styles.forecast}>Prognos</span>
            </div>
            <p className={styles.copy}>
              Faktiskt kassaläge räknas från bank- och kassakonton. Resterande månader simuleras
              med föregående års kassaflöde och ska senare kunna justeras inför styrelsemöten.
            </p>
            <div className={styles.forecastList}>
              <span>Senast faktiskt: {formatThousands(latestActualCash)}</span>
              <span>Prognos årsslut: {forecastEnd ? formatThousands(forecastEnd) : "saknas"}</span>
              <span>Konton: 1910, 1920, 1930, 1939, 1940, 1950, 1960</span>
            </div>
          </article>

          <article className={styles.panel} id="comparison">
            <div className={styles.panelHeader}>
              <div>
                <span>Kategorier</span>
                <h2>Begripliga kontogrupper</h2>
              </div>
            </div>
            <div className={styles.categoryList}>
              {categories.map((category) => (
                <div key={category.id}>
                  <span>{category.label}</span>
                  <strong>{formatThousands(category.amount)}</strong>
                  <small>{percentChange(category.amount, category.previousAmount)}</small>
                </div>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
