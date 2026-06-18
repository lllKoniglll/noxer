import { BarChart3, CalendarRange, Download, Landmark, LineChart } from "lucide-react";
import {
  buildCashForecast,
  formatThousands,
  getAvailableYears,
  loadAccountingDataset
} from "@/lib/reports/accounting";
import styles from "../../page.module.css";

export default async function LiquidityReportPage() {
  const dataset = await loadAccountingDataset();
  const years = getAvailableYears(dataset);
  const selectedYear = years.at(-1) ?? 2026;
  const cashForecast = buildCashForecast(dataset, selectedYear);
  const latestActualCash = [...cashForecast].reverse().find((point) => point.actual !== null)?.actual ?? 0;
  const forecastEnd = [...cashForecast].reverse().find((point) => point.forecast !== null)?.forecast;
  const maxCash = Math.max(...cashForecast.map((point) => point.actual ?? point.forecast ?? 0), 1);

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
          <a href="/">
            <BarChart3 size={18} aria-hidden="true" />
            Månadsöversikt
          </a>
          <a className={styles.active} href="/reports/liquidity">
            <LineChart size={18} aria-hidden="true" />
            Likviditet
          </a>
          <a href="/reports/categories">
            <CalendarRange size={18} aria-hidden="true" />
            Kategorier
          </a>
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>{dataset.organizationName}</p>
            <h1>Likviditet {selectedYear}</h1>
            <span className={styles.fileStatus}>Faktiskt till {dataset.latestVoucherDate}, därefter prognos</span>
          </div>
          <div className={styles.actions}>
            <button type="button" title="Exportera likviditetsrapport">
              <Download size={18} aria-hidden="true" />
              Excel
            </button>
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
            <span>Modell</span>
            <strong>Justerbar</strong>
            <small>Scenariojustering byggs nästa steg</small>
          </article>
          <article>
            <span>Konton</span>
            <strong>7 st</strong>
            <small>1910-1960 enligt plan</small>
          </article>
        </section>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Likviditetsanalys</span>
              <h2>Faktiskt plus prognos för hela året</h2>
            </div>
          </div>
          <div
            className={styles.cashChart}
            style={{ gridTemplateColumns: `repeat(${cashForecast.length}, minmax(64px, 1fr))` }}
          >
            {cashForecast.map((point) => {
              const value = point.actual ?? point.forecast ?? 0;
              return (
                <div className={styles.month} key={point.month}>
                  <div className={styles.cashBars}>
                    <span
                      className={point.actual === null ? styles.forecastBar : styles.actualBar}
                      style={{ height: `${Math.max((value / maxCash) * 100, 2)}%` }}
                    />
                  </div>
                  <strong>{point.label}</strong>
                </div>
              );
            })}
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Månad</th>
                <th>Faktiskt saldo</th>
                <th>Prognos</th>
              </tr>
            </thead>
            <tbody>
              {cashForecast.map((point) => (
                <tr key={point.month}>
                  <td>{point.label}</td>
                  <td>{point.actual === null ? "" : formatThousands(point.actual)}</td>
                  <td>{point.forecast === null ? "" : formatThousands(point.forecast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </main>
  );
}
