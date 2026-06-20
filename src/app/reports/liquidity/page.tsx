import { BarChart3, Bot, CalendarRange, Download, Landmark, LineChart } from "lucide-react";
import { SortableTable } from "@/app/sortable-table";
import {
  buildCashForecast,
  formatThousands,
  getAvailableYears,
  loadAccountingDataset,
  parseComparisonMode
} from "@/lib/reports/accounting";
import styles from "../../page.module.css";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LiquidityReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const comparisonMode = parseComparisonMode(params?.comparison);
  const comparisonQuery = `?comparison=${comparisonMode}`;
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
          <a href={`/${comparisonQuery}`}>
            <BarChart3 size={18} aria-hidden="true" />
            Månadsöversikt
          </a>
          <a className={styles.active} href="/reports/liquidity">
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
