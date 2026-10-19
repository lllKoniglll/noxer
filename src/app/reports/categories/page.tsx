"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, Bot, CalendarRange, ChevronRight, FileUp, Landmark, LineChart, Settings2, WalletCards } from "lucide-react";
import Link from "next/link";
import { ComparisonToggle } from "@/app/report-controls";
import {
  buildCategoryAccountSummary,
  buildCategorySummary,
  buildAccountTransactions,
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
import { LogoutLink } from "@/app/logout-link";
import type { AccountingDataset } from "@/lib/sie/types";
import styles from "../../page.module.css";

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
  const { files, categories: categoryConfig } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  useEffect(() => { loadAccountingDataset(files).then(setDataset); }, [files]);
  const comparisonMode = parseComparisonMode(params.get("comparison") ?? undefined);
  const comparisonQuery = `?comparison=${comparisonMode}`;
  const years = getAvailableYears(dataset);
  const selectedYear = years.at(-1) ?? 2026;
  const categories = buildCategorySummary(dataset, selectedYear, comparisonMode, categoryConfig);
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
          <Link href="/"><BarChart3 size={18} aria-hidden="true" />Översikt</Link>
          <Link href={`/reports/monthly${comparisonQuery}`}>
            <BarChart3 size={18} aria-hidden="true" />
            Månadsöversikt
          </Link>
          <Link href={`/reports/liquidity${comparisonQuery}`}>
            <LineChart size={18} aria-hidden="true" />
            Likviditet
          </Link>
          <Link className={styles.active} href="/reports/categories">
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
          <Link href="/categories"><Settings2 size={18} aria-hidden="true" />Redigera kategorier</Link>
          <LogoutLink />
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>{dataset.organizationName}</p>
            <h1>Resultat per kategori {selectedYear}</h1>
            <span className={styles.fileStatus}>Begripliga kontogrupper för styrelseuppföljning</span>
          </div>
          <div className={styles.actions}>
            <ComparisonToggle
              activeMode={comparisonMode}
              basePath="/reports/categories"
              cutoffLabel={cutoff ? `Jämför t.o.m. ${formatSieDate(cutoff)}` : undefined}
            />
          </div>
        </header>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Kategorier</span>
              <h2>Resultat och avvikelse jämfört med {comparisonLabel.toLowerCase()}</h2>
            </div>
          </div>
          <div className={styles.categoryChangeChart} aria-label="Horisontellt stapeldiagram över förändring per kategori">
            {categories.map((category) => {
              const change = category.amount - category.previousAmount;
              const isExpanded = expandedCategory === category.id;
              const accounts = isExpanded ? buildCategoryAccountSummary(dataset, selectedYear, comparisonMode, category.id, categoryConfig) : [];
              return (
                <div className={styles.categoryChangeItem} key={category.id}>
                  <button className={styles.categoryChangeRow} data-tooltip={`${category.label}: ${formatThousands(change)}`} onClick={() => setExpandedCategory(isExpanded ? null : category.id)} title={`${category.label}: ${formatThousands(change)}`} type="button" aria-expanded={isExpanded}>
                    <strong className={styles.categoryChangeLabel}><span>{category.label}</span><ChevronRight size={16} aria-hidden="true" /></strong>
                    <span className={styles.categoryCurrentValue}>{formatThousands(category.amount)}</span>
                    <div className={styles.categoryChangeTrack}>
                      <span className={styles.categoryChangeBaseline} />
                      {change !== 0 ? <span className={change > 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max((Math.abs(change) / maxCategoryChange) * 50, 1)}%` }} /> : null}
                    </div>
                    <span className={change > 0 ? styles.betterText : change < 0 ? styles.worseText : styles.neutralText}>{formatThousands(change)}</span>
                  </button>
                  {isExpanded ? <div className={styles.chartCategoryDetails}><strong>Konton i {category.label}</strong><table className={styles.categoryDetailsTable}><thead><tr><th>Konto</th><th>{selectedYear - 1}</th><th>{selectedYear}</th></tr></thead><tbody>{accounts.map((account) => { const accountIsExpanded = expandedAccount === account.account; const transactions = accountIsExpanded ? buildAccountTransactions(dataset, [account.account]).filter((row) => (row.years[String(selectedYear - 1)] ?? 0) !== 0 || (row.years[String(selectedYear)] ?? 0) !== 0) : []; return <Fragment key={account.account}><tr><td><button className={styles.accountDetailToggle} onClick={() => setExpandedAccount(accountIsExpanded ? null : account.account)} type="button" aria-expanded={accountIsExpanded}><ChevronRight className={accountIsExpanded ? styles.categoryChevronOpen : undefined} size={15} aria-hidden="true" />{account.account} · {account.name}</button></td><td className={amountClass(account.previousAmount)}>{formatThousands(account.previousAmount)}</td><td className={amountClass(account.amount)}>{formatThousands(account.amount)}</td></tr>{accountIsExpanded ? <tr><td colSpan={3}><div className={styles.transactionDetails}><strong>Transaktioner för {account.account}</strong><table><thead><tr><th>Datum</th><th>Verifikation</th><th>Text</th><th>{selectedYear - 1}</th><th>{selectedYear}</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={`${transaction.date}-${transaction.voucher}-${transaction.text}`}><td>{transaction.date}</td><td>{transaction.voucher}</td><td>{transaction.text}</td><td className={amountClass(transaction.years[String(selectedYear - 1)] ?? 0)}>{formatThousands(transaction.years[String(selectedYear - 1)] ?? 0)}</td><td className={amountClass(transaction.years[String(selectedYear)] ?? 0)}>{formatThousands(transaction.years[String(selectedYear)] ?? 0)}</td></tr>)}</tbody></table></div></td></tr> : null}</Fragment>; })}</tbody><tfoot><tr><td>Total</td><td className={amountClass(category.previousAmount)}>{formatThousands(category.previousAmount)}</td><td className={amountClass(category.amount)}>{formatThousands(category.amount)}</td></tr></tfoot></table></div> : null}
                </div>
              );
            })}
            <div className={`${styles.categoryChangeRow} ${styles.categoryChangeTotalRow}`} data-tooltip={`Resultat: ${formatThousands(totalCurrent - totalPrevious)}`} title={`Resultat: ${formatThousands(totalCurrent - totalPrevious)}`}>
              <strong>Resultat</strong>
              <span className={styles.categoryCurrentValue}>{formatThousands(totalCurrent)}</span>
              <div className={styles.categoryChangeTrack}>
                <span className={styles.categoryChangeBaseline} />
                {totalCurrent !== totalPrevious ? <span className={totalCurrent > totalPrevious ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max((Math.abs(totalCurrent - totalPrevious) / maxCategoryChange) * 50, 1)}%` }} /> : null}
              </div>
              <span className={totalComparison.className}>{formatThousands(totalCurrent - totalPrevious)}</span>
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
