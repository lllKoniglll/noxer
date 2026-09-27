"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, Bot, CalendarRange, FileUp, Landmark, LineChart, Settings2, WalletCards } from "lucide-react";
import Link from "next/link";
import {
  buildCashForecast,
  buildLiquidityCategorySummary,
  buildLiquidityCategoryTransactions,
  buildProjectedResult,
  formatThousands,
  getCashOpeningBalance,
  getAvailableYears,
  loadAccountingDataset,
  emptyAccountingDataset,
  type CashForecastMode,
  formatMonth,
  parseComparisonMode
} from "@/lib/reports/accounting";
import { useUploads } from "@/app/upload-context";
import { LogoutLink } from "@/app/logout-link";
import type { AccountingDataset } from "@/lib/sie/types";
import styles from "../../page.module.css";

function LiquidityReportPageContent() {
  const params = useSearchParams();
  const { files, categories } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());
  const [forecastMode, setForecastMode] = useState<CashForecastMode>("latestDate");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [expandedMonthCategory, setExpandedMonthCategory] = useState<string | null>(null);
  const [expandedMonthCategoryAccount, setExpandedMonthCategoryAccount] = useState<string | null>(null);
  useEffect(() => { loadAccountingDataset(files).then(setDataset); }, [files]);
  const comparisonMode = parseComparisonMode(params.get("comparison") ?? undefined);
  const comparisonQuery = `?comparison=${comparisonMode}`;
  const years = getAvailableYears(dataset);
  const selectedYear = years.at(-1) ?? 2026;
  const cashForecast = buildCashForecast(dataset, selectedYear, forecastMode);
  const latestActualCash = [...cashForecast].reverse().find((point) => point.actual !== null)?.actual ?? 0;
  const forecastEnd = [...cashForecast].reverse().find((point) => point.forecast !== null)?.forecast;
  const maxCash = Math.max(...cashForecast.flatMap((point) => [point.actual ?? 0, point.forecast ?? 0]), 1);
  const actualMonths = cashForecast.filter((point) => point.actual !== null).length;
  const latestActualMonth = [...cashForecast].reverse().find((point) => point.actual !== null)?.label;
  const projectedResult = buildProjectedResult(dataset, selectedYear, forecastMode);

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
          <Link className={styles.active} href="/reports/liquidity">
            <LineChart size={18} aria-hidden="true" />
            Likviditet
          </Link>
          <Link href={`/reports/categories${comparisonQuery}`}>
            <CalendarRange size={18} aria-hidden="true" />
            Kategorier
          </Link>
          <Link href="/reports/accounts">
            <BarChart3 size={18} aria-hidden="true" />
            Kontojämförelse
          </Link>
          <Link href="/reports/budget"><WalletCards size={18} aria-hidden="true" />Budget</Link>
          <Link href="/reports/budget/annual"><WalletCards size={18} aria-hidden="true" />Budget över året</Link>
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
            <h1>Likviditet och prognos {selectedYear}</h1>
            <span className={styles.fileStatus}>
              Faktiskt till {dataset.latestVoucherDate ?? "saknas"}, {forecastMode === "latestDate" ? "prognos från nästa dag" : "prognos från föregående hela månad"}
            </span>
          </div>
          <div className={styles.actions}>
            <label className={styles.forecastControl}>
              <span>Prognos från</span>
              <select aria-label="Välj när prognosen ska börja" onChange={(event) => setForecastMode(event.target.value as CashForecastMode)} value={forecastMode}>
                <option value="latestDate">Senaste datum ({dataset.latestVoucherDate ? `${formatMonth(Number(dataset.latestVoucherDate.slice(4, 6)))} ${dataset.latestVoucherDate.slice(6, 8)}` : "saknas"})</option>
                <option value="fullMonth">Föregående hela månad</option>
              </select>
            </label>
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
            <span>Faktisk period</span>
            <strong>{actualMonths}/12 mån</strong>
            <small>Utfall t.o.m. {latestActualMonth ?? "saknas"}</small>
          </article>
          <article>
            <span>Prognostiserat resultat</span>
            <strong>{formatThousands(projectedResult)}</strong>
            <small>Prognos saldo 31 dec − saldo 1 jan</small>
          </article>
        </section>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Likviditetsanalys</span>
              <h2>Faktiskt plus prognos för hela året</h2>
            </div>
          </div>
          <div className={styles.legend} aria-label="Diagramförklaring">
            <span><i className={styles.actualDot} /> Faktiskt saldo</span>
            <span><i className={styles.forecastDot} /> Prognos</span>
          </div>
          <div
            className={styles.cashChart}
            style={{ gridTemplateColumns: `repeat(${cashForecast.length}, minmax(64px, 1fr))` }}
          >
            {cashForecast.map((point) => {
              const value = point.forecast ?? point.actual ?? 0;
              const actualFraction = point.actualFraction ?? (point.actual !== null ? 1 : 0);
              const barBackground = actualFraction >= 1
                ? "var(--cash)"
                : actualFraction <= 0
                  ? "var(--forecast)"
                  : `linear-gradient(to top, var(--cash) 0%, var(--cash) ${actualFraction * 100}%, var(--forecast) ${actualFraction * 100}%, var(--forecast) 100%)`;
              const tooltip = point.actual !== null && point.forecast !== null
                ? `${point.label}: Faktiskt ${formatThousands(point.actual)} · Prognos ${formatThousands(point.forecast)}`
                : point.actual !== null
                  ? `${point.label}: Faktiskt ${formatThousands(point.actual)}`
                  : `${point.label}: Prognos ${formatThousands(point.forecast ?? 0)}`;
              return (
                <div className={styles.month} key={point.month}>
                  <div className={styles.cashBars}>
                    <span className={styles.cashBarWrap} style={{ height: `${Math.max((value / maxCash) * 100, 2)}%` }}>
                      <span aria-label={tooltip} className={styles.cashBar} style={{ background: barBackground, height: "100%" }} />
                      <span className={styles.cashTooltip} role="tooltip">{tooltip}</span>
                    </span>
                  </div>
                  <strong>{point.label}</strong>
                </div>
              );
            })}
          </div>
          <div className={`${styles.chatTable} ${styles.wideTable}`}>
            <div className={styles.tableHeader}><h3>Likviditetsdata</h3><span className={styles.tableHint}>Klicka på en månad för kategorisummering</span></div>
            <div className={styles.tableScroll}><table><thead><tr><th>Månad</th><th>Faktiskt saldo</th><th>Prognos</th><th>Förändring</th></tr></thead><tbody>{cashForecast.map((point, index) => { const isExpanded = expandedMonth === point.month; const previousPoint = cashForecast[index - 1]; const displayedBalance = point.actual ?? point.forecast; const previousBalance = previousPoint ? previousPoint.actual ?? previousPoint.forecast : getCashOpeningBalance(dataset); const change = displayedBalance !== null && displayedBalance !== undefined && previousBalance !== null && previousBalance !== undefined ? displayedBalance - previousBalance : null; const monthCategories = isExpanded ? buildLiquidityCategorySummary(dataset, selectedYear, Number(point.month), forecastMode, categories) : []; const sourceLabel = point.actual === null ? `Prognos baserad på ${point.label} ${selectedYear - 1}` : point.forecast !== null ? `Utfall + prognos baserad på ${point.label} ${selectedYear - 1}` : "Utfall"; return <Fragment key={point.month}><tr><td><button className={styles.accountDetailToggle} aria-expanded={isExpanded} onClick={() => setExpandedMonth(isExpanded ? null : point.month)} type="button"><span className={isExpanded ? styles.categoryChevronOpen : undefined}>›</span>{point.label}</button></td><td>{point.actual === null ? "–" : formatThousands(point.actual)}</td><td>{point.forecast === null ? "–" : formatThousands(point.forecast)}</td><td className={change === null ? undefined : change >= 0 ? styles.incomeText : styles.costText}>{change === null ? "–" : formatThousands(change)}</td></tr>{isExpanded ? <tr><td colSpan={4}><div className={styles.transactionDetails}><strong>Kategorier i {point.label} · {sourceLabel}</strong><table className={styles.liquidityCategoryTable}><thead><tr><th>Kategori</th><th>Utfall/prognos</th></tr></thead><tbody>{monthCategories.length ? monthCategories.map((category) => { const categoryKey = `${point.month}:${category.id}`; const categoryIsExpanded = expandedMonthCategory === categoryKey; const transactions = categoryIsExpanded ? buildLiquidityCategoryTransactions(dataset, selectedYear, Number(point.month), category.id, forecastMode, categories) : []; const accountGroups = Array.from(new Map(transactions.map((transaction) => [transaction.account, { account: transaction.account, accountName: transaction.accountName, amount: transactions.filter((item) => item.account === transaction.account).reduce((sum, item) => sum + item.amount, 0) }])).values()); return <Fragment key={category.id}><tr><td><button className={styles.accountDetailToggle} aria-expanded={categoryIsExpanded} onClick={() => setExpandedMonthCategory(categoryIsExpanded ? null : categoryKey)} type="button"><span className={categoryIsExpanded ? styles.categoryChevronOpen : undefined}>›</span>{category.label}</button></td><td className={category.amount > 0 ? styles.incomeText : styles.costText}>{formatThousands(category.amount)}</td></tr>{categoryIsExpanded ? <tr><td colSpan={2}><div className={styles.transactionDetails}><strong>Konton i {category.label}</strong><table className={styles.liquidityCategoryTable}><thead><tr><th>Konto</th><th>Utfall/prognos</th></tr></thead><tbody>{accountGroups.map((account) => { const accountKey = `${categoryKey}:${account.account}`; const accountIsExpanded = expandedMonthCategoryAccount === accountKey; const accountTransactions = accountIsExpanded ? transactions.filter((transaction) => transaction.account === account.account) : []; return <Fragment key={account.account}><tr><td><button className={styles.accountDetailToggle} aria-expanded={accountIsExpanded} onClick={() => setExpandedMonthCategoryAccount(accountIsExpanded ? null : accountKey)} type="button"><span className={accountIsExpanded ? styles.categoryChevronOpen : undefined}>›</span>{account.account} · {account.accountName}</button></td><td className={account.amount > 0 ? styles.incomeText : styles.costText}>{formatThousands(account.amount)}</td></tr>{accountIsExpanded ? <tr><td colSpan={2}><div className={styles.transactionDetails}><strong>Transaktioner för {account.account}</strong><table className={styles.liquidityTransactionTable}><thead><tr><th>Datum</th><th>Verifikation</th><th>Text</th><th>Utfall/prognos</th></tr></thead><tbody>{accountTransactions.map((transaction, transactionIndex) => <tr className={transaction.sourceYear !== selectedYear ? styles.forecastTransaction : undefined} key={`${transaction.date}-${transaction.voucher}-${transactionIndex}`} title={transaction.sourceYear !== selectedYear ? `Prognos från ${transaction.sourceYear}` : undefined}><td>{transaction.date}</td><td>{transaction.voucher}</td><td>{transaction.text}</td><td className={transaction.amount > 0 ? styles.incomeText : styles.costText}>{formatThousands(transaction.amount)}</td></tr>)}</tbody></table></div></td></tr> : null}</Fragment>; })}</tbody></table></div></td></tr> : null}</Fragment>; }) : <tr><td colSpan={2}>Inga resultattransaktioner för månaden.</td></tr>}</tbody><tfoot><tr><td>Total</td><td>{formatThousands(monthCategories.reduce((sum, category) => sum + category.amount, 0))}</td></tr></tfoot></table></div></td></tr> : null}</Fragment>; })}</tbody></table></div>
          </div>
        </article>
      </section>
    </main>
  );
}

export default function LiquidityReportPage() {
  return (
    <Suspense fallback={<main style={{ padding: 32 }}>Laddar rapport...</main>}>
      <LiquidityReportPageContent />
    </Suspense>
  );
}
