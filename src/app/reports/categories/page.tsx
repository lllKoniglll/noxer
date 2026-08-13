"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, Bot, CalendarRange, Download, Landmark, LineChart } from "lucide-react";
import { ComparisonToggle } from "@/app/report-controls";
import { SortableTable } from "@/app/sortable-table";
import {
  buildCategorySummary,
  comparisonCutoffDate,
  comparisonModeLabel,
  emptyAccountingDataset,
  formatSieDate,
  getAvailableYears,
  loadAccountingDataset,
  parseComparisonMode
} from "@/lib/reports/accounting";
import { useUploads } from "@/app/upload-context";
import type { AccountingDataset } from "@/lib/sie/types";
import styles from "../../page.module.css";

function percentChange(current: number, previous: number): string {
  if (!previous) return "Nytt jämförelsetal";
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? "+" : ""}${Math.round(change)}%`;
}

const INCOME_CATEGORY_IDS = new Set(["fees", "grants", "sales"]);

export default function CategoriesReportPage() {
  const params = useSearchParams();
  const { files } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());
  useEffect(() => { loadAccountingDataset(files).then(setDataset); }, [files]);
  const comparisonMode = parseComparisonMode(params.get("comparison") ?? undefined);
  const comparisonQuery = `?comparison=${comparisonMode}`;
  const years = getAvailableYears(dataset);
  const selectedYear = years.at(-1) ?? 2026;
  const categories = buildCategorySummary(dataset, selectedYear, comparisonMode);
  const cutoff = comparisonCutoffDate(dataset, selectedYear, comparisonMode);
  const comparisonLabel = comparisonModeLabel(comparisonMode);

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
          <a href={`/${comparisonQuery}`}>
            <BarChart3 size={18} aria-hidden="true" />
            Månadsöversikt
          </a>
          <a href={`/reports/liquidity${comparisonQuery}`}>
            <LineChart size={18} aria-hidden="true" />
            Likviditet
          </a>
          <a className={styles.active} href="/reports/categories">
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
            <h1>Kategorier {selectedYear}</h1>
            <span className={styles.fileStatus}>Begripliga kontogrupper för styrelseuppföljning</span>
          </div>
          <div className={styles.actions}>
            <ComparisonToggle
              activeMode={comparisonMode}
              basePath="/reports/categories"
              cutoffLabel={cutoff ? `Jämför t.o.m. ${formatSieDate(cutoff)}` : undefined}
            />
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
              <h2>Utfall jämfört med {comparisonLabel.toLowerCase()}</h2>
            </div>
          </div>
          <SortableTable
            columns={[
              { key: "category", label: "Kategori", format: "text", summable: false },
              { key: "amount", label: String(selectedYear), format: "thousands" },
              { key: "previousAmount", label: String(selectedYear - 1), format: "thousands" },
              { key: "change", label: "Förändring", format: "text", summable: false }
            ]}
            rows={categories.map((category) => ({
              Typ: INCOME_CATEGORY_IDS.has(category.id) ? "Intäkt" : "Kostnad",
              category: category.label,
              amount: category.amount,
              previousAmount: category.previousAmount,
              change: percentChange(category.amount, category.previousAmount)
            }))}
            title="Kategoridata"
            wide
          />
        </article>
      </section>
    </main>
  );
}
