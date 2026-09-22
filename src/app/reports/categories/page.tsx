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
  const change = current - previous;
  if (change === 0) return { label: formatThousands(0), className: styles.neutralText };
  return {
    label: formatThousands(change),
    className: change > 0 ? styles.betterText : styles.worseText
  };
}

function amountClass(value: number): string | undefined {
  if (value > 0) return styles.incomeText;
  if (value < 0) return styles.costText;
  return undefined;
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
  const totalCurrent = categories.reduce((sum, category) => sum + category.amount, 0);
  const totalPrevious = categories.reduce((sum, category) => sum + category.previousAmount, 0);
  const maxCategoryChange = Math.max(
    ...categories.map((category) => Math.abs(category.amount - category.previousAmount)),
    Math.abs(totalCurrent - totalPrevious),
    1
  );
  const totalComparison = comparisonResult(totalCurrent, totalPrevious);

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
          <div className={styles.categoryChangeChart} aria-label="Horisontellt stapeldiagram över förändring per kategori">
            {categories.map((category) => {
              const change = category.amount - category.previousAmount;
              return (
                <div className={styles.categoryChangeRow} data-tooltip={`${category.label}: ${formatThousands(change)}`} key={category.id} title={`${category.label}: ${formatThousands(change)}`}>
                  <strong>{category.label}</strong>
                  <div className={styles.categoryChangeTrack}>
                    <span className={styles.categoryChangeBaseline} />
                    {change !== 0 ? <span className={change > 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max((Math.abs(change) / maxCategoryChange) * 50, 1)}%` }} /> : null}
                  </div>
                  <span className={change > 0 ? styles.betterText : change < 0 ? styles.worseText : styles.neutralText}>{formatThousands(change)}</span>
                </div>
              );
            })}
            <div className={`${styles.categoryChangeRow} ${styles.categoryChangeTotalRow}`} data-tooltip={`Resultat: ${formatThousands(totalCurrent - totalPrevious)}`} title={`Resultat: ${formatThousands(totalCurrent - totalPrevious)}`}>
              <strong>Resultat</strong>
              <div className={styles.categoryChangeTrack}>
                <span className={styles.categoryChangeBaseline} />
                {totalCurrent !== totalPrevious ? <span className={totalCurrent > totalPrevious ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max((Math.abs(totalCurrent - totalPrevious) / maxCategoryChange) * 50, 1)}%` }} /> : null}
              </div>
              <span className={totalComparison.className}>{formatThousands(totalCurrent - totalPrevious)}</span>
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
                          <td className={amountClass(category.previousAmount)}>{formatThousands(category.previousAmount)}</td>
                          <td className={amountClass(category.amount)}>{formatThousands(category.amount)}</td>
                          <td className={result.className}>{result.label}</td>
                        </tr>
                        {isExpanded ? (
                          <tr key={`${category.id}-details`}>
                            <td colSpan={4}>
                              <div className={styles.categoryDetails}>
                                <strong>Konton i {category.label}</strong>
                                <table className={styles.categoryDetailsTable}>
                                  <thead><tr><th>Konto</th><th>{selectedYear - 1}</th><th>{selectedYear}</th></tr></thead>
                                  <tbody>{accounts.map((account) => <tr key={account.account}><td>{account.account} · {account.name}</td><td className={amountClass(account.previousAmount)}>{formatThousands(account.previousAmount)}</td><td className={amountClass(account.amount)}>{formatThousands(account.amount)}</td></tr>)}</tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot><tr><td>Resultat</td><td>{formatThousands(totalPrevious)}</td><td>{formatThousands(totalCurrent)}</td><td className={totalComparison.className}>{totalComparison.label}</td></tr></tfoot>
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
