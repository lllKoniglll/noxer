"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, Bot, CalendarRange, ChevronRight, Download, Landmark, LineChart } from "lucide-react";
import { ComparisonToggle } from "@/app/report-controls";
import {
  buildCategoryAccountSummary,
  buildCategorySummary,
  comparisonCutoffDate,
  comparisonModeLabel,
  emptyAccountingDataset,
  formatThousands,
  formatSieDate,
  getAvailableYears,
  loadAccountingDataset,
  parseComparisonMode
} from "@/lib/reports/accounting";
import { useUploads } from "@/app/upload-context";
import type { AccountingDataset } from "@/lib/sie/types";
import styles from "../../page.module.css";

const INCOME_CATEGORY_IDS = new Set(["fees", "grants", "sales"]);

function comparisonResult(current: number, previous: number) {
  if (!previous) return { label: "Nytt jämförelsetal", className: styles.neutralText };
  if (current === previous) return { label: "Oförändrat", className: styles.neutralText };
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const improved = current > previous;
  return {
    label: `${change >= 0 ? "+" : ""}${Math.round(change)}% · ${improved ? "Bättre" : "Sämre"}`,
    className: improved ? styles.betterText : styles.worseText
  };
}

function CategoriesReportPageContent() {
  const params = useSearchParams();
  const { files } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
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
          <a href="/reports/accounts">
            <BarChart3 size={18} aria-hidden="true" />
            Kontojämförelse
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
              <h2>Nettoresultat jämfört med {comparisonLabel.toLowerCase()}</h2>
            </div>
          </div>
          <div className={`${styles.chatTable} ${styles.wideTable}`}>
            <div className={styles.tableHeader}>
              <h3>Kategoridata</h3>
              <span className={styles.tableHint}>Klicka på en kategori för att visa kontona</span>
            </div>
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr><th>Kategori</th><th>{selectedYear - 1}</th><th>{selectedYear}</th><th>Förändring</th></tr>
                </thead>
                <tbody>
                  {categories.map((category) => {
                    const isIncome = INCOME_CATEGORY_IDS.has(category.id);
                    const result = comparisonResult(category.amount, category.previousAmount);
                    const isExpanded = expandedCategory === category.id;
                    const accounts = isExpanded ? buildCategoryAccountSummary(dataset, selectedYear, comparisonMode, category.id) : [];
                    return (
                      <Fragment key={category.id}>
                        <tr>
                          <td>
                            <button
                              aria-expanded={isExpanded}
                              className={styles.categoryToggle}
                              onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                              type="button"
                            >
                              <ChevronRight className={isExpanded ? styles.categoryChevronOpen : undefined} size={17} aria-hidden="true" />
                              <span><strong>{category.label}</strong><small>{isIncome ? "Intäkt" : "Kostnad"}</small></span>
                            </button>
                          </td>
                          <td className={isIncome ? styles.incomeText : styles.costText}>{formatThousands(category.previousAmount)}</td>
                          <td className={isIncome ? styles.incomeText : styles.costText}>{formatThousands(category.amount)}</td>
                          <td className={result.className}>{result.label}</td>
                        </tr>
                        {isExpanded ? (
                          <tr key={`${category.id}-details`}>
                            <td colSpan={4}>
                              <div className={styles.categoryDetails}>
                                <strong>Konton i {category.label}</strong>
                                <table className={styles.categoryDetailsTable}>
                                  <thead><tr><th>Konto</th><th>{selectedYear - 1}</th><th>{selectedYear}</th></tr></thead>
                                  <tbody>{accounts.map((account) => <tr key={account.account}><td>{account.account} · {account.name}</td><td className={isIncome ? styles.incomeText : styles.costText}>{formatThousands(account.previousAmount)}</td><td className={isIncome ? styles.incomeText : styles.costText}>{formatThousands(account.amount)}</td></tr>)}</tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot><tr><td>Summa</td><td>{formatThousands(categories.reduce((sum, category) => sum + category.previousAmount, 0))}</td><td>{formatThousands(categories.reduce((sum, category) => sum + category.amount, 0))}</td><td /></tr></tfoot>
              </table>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

export default function CategoriesReportPage() {
  return (
    <Suspense fallback={<main style={{ padding: 32 }}>Laddar rapport...</main>}>
      <CategoriesReportPageContent />
    </Suspense>
  );
}
