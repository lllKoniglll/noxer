import { BarChart3, CalendarRange, Download, Landmark, LineChart } from "lucide-react";
import {
  buildCategorySummary,
  formatThousands,
  getAvailableYears,
  loadAccountingDataset
} from "@/lib/reports/accounting";
import styles from "../../page.module.css";

function percentChange(current: number, previous: number): string {
  if (!previous) return "Nytt jämförelsetal";
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? "+" : ""}${Math.round(change)}%`;
}

export default async function CategoriesReportPage() {
  const dataset = await loadAccountingDataset();
  const years = getAvailableYears(dataset);
  const selectedYear = years.at(-1) ?? 2026;
  const categories = buildCategorySummary(dataset, selectedYear);

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
          <a href="/reports/liquidity">
            <LineChart size={18} aria-hidden="true" />
            Likviditet
          </a>
          <a className={styles.active} href="/reports/categories">
            <CalendarRange size={18} aria-hidden="true" />
            Kategorier
          </a>
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>{dataset.organizationName}</p>
            <h1>Kategorier {selectedYear}</h1>
            <span className={styles.fileStatus}>Begripliga kontogrupper för styrelseuppföljning</span>
          </div>
          <div className={styles.actions}>
            <button type="button" title="Exportera kategorirapport">
              <Download size={18} aria-hidden="true" />
              Excel
            </button>
          </div>
        </header>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Kategorier</span>
              <h2>Utfall jämfört med föregående år</h2>
            </div>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Kategori</th>
                <th>{selectedYear}</th>
                <th>{selectedYear - 1}</th>
                <th>Förändring</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>{category.label}</td>
                  <td>{formatThousands(category.amount)}</td>
                  <td>{formatThousands(category.previousAmount)}</td>
                  <td>{percentChange(category.amount, category.previousAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </main>
  );
}
