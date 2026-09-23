"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bot, CalendarRange, FileUp, Landmark, LineChart, WalletCards } from "lucide-react";
import { useUploads } from "@/app/upload-context";
import { parseBudgetBuffer } from "@/lib/budget/parser";
import { buildBudgetCategorySummary, buildCashForecast, buildProjectedResult, emptyAccountingDataset, formatThousands, loadAccountingDataset } from "@/lib/reports/accounting";
import type { AccountingDataset, BudgetDataset } from "@/lib/sie/types";
import styles from "./page.module.css";

function resultClass(value: number): string | undefined {
  if (value > 0) return styles.incomeText;
  if (value < 0) return styles.costText;
  return undefined;
}

export default function OverviewPage() {
  const { files } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());
  const [budget, setBudget] = useState<BudgetDataset | undefined>();

  useEffect(() => { void loadAccountingDataset(files).then(setDataset); }, [files]);
  useEffect(() => {
    let active = true;
    const budgetFile = files.filter((file) => file.name.toLowerCase().endsWith(".xls")).at(-1);
    if (!budgetFile) { setBudget(undefined); return () => { active = false; }; }
    void budgetFile.arrayBuffer().then((buffer) => {
      try {
        const parsed = parseBudgetBuffer(new Uint8Array(buffer), budgetFile.name);
        if (active) setBudget(parsed);
      } catch {
        if (active) setBudget(undefined);
      }
    });
    return () => { active = false; };
  }, [files]);

  const year = budget?.year ?? (Number(dataset.latestVoucherDate?.slice(0, 4)) || new Date().getFullYear());
  const projectedResult = buildProjectedResult(dataset, year, "latestDate");
  const categories = useMemo(() => budget ? buildBudgetCategorySummary(dataset, budget).filter((category) => category.id !== "other").slice(0, 6) : [], [dataset, budget]);
  const budgetTotals = useMemo(() => budget ? buildBudgetCategorySummary(dataset, budget).reduce((sum, category) => ({ budget: sum.budget + category.budget, actual: sum.actual + category.actual, variance: sum.variance + category.variance }), { budget: 0, actual: 0, variance: 0 }) : undefined, [dataset, budget]);
  const maxVariance = Math.max(...categories.map((category) => Math.abs(category.variance)), Math.abs(budgetTotals?.variance ?? 0), 1);
  const latestDate = dataset.latestVoucherDate;
  const cashForecast = buildCashForecast(dataset, year, "latestDate");
  const currentCash = [...cashForecast].reverse().find((point) => point.actual !== null)?.actual ?? 0;

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Rapporter">
        <div className={styles.brand}><Landmark size={26} aria-hidden="true" /><div><strong>Kronängs IF</strong><span>Styrelserapport</span></div></div>
        <nav className={styles.nav}>
          <a className={styles.active} href="/"><BarChart3 size={18} aria-hidden="true" />Översikt</a>
          <a href="/reports/monthly"><BarChart3 size={18} aria-hidden="true" />Månadsöversikt</a>
          <a href="/reports/liquidity"><LineChart size={18} aria-hidden="true" />Likviditet</a>
          <a href="/reports/categories"><CalendarRange size={18} aria-hidden="true" />Kategorier</a>
          <a href="/reports/accounts"><BarChart3 size={18} aria-hidden="true" />Kontojämförelse</a>
          <a href="/reports/budget"><WalletCards size={18} aria-hidden="true" />Budget</a>
          <a href="/chat"><Bot size={18} aria-hidden="true" />Chat</a>
          <a href="/files"><FileUp size={18} aria-hidden="true" />Filer</a>
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><p>{dataset.organizationName}</p><h1>Översikt {year}</h1><span className={styles.fileStatus}>{latestDate ? `Utfall t.o.m. ${latestDate}` : "Ladda upp underlag på sidan Filer"}</span></div>
        </header>

        {!files.length ? <div className={styles.emptyState}><BarChart3 size={32} aria-hidden="true" /><h2>Översikten fylls när du laddar upp underlag</h2><p>Ladda upp SIE4-filer och gärna resultatrapporten med budget på sidan Filer.</p></div> : (
          <>
            <section className={styles.dashboardHero} aria-label="Viktigaste ekonomiska nyckeltalen">
              <article className={styles.dashboardResultCard}><span>Prognostiserat resultat</span><strong className={resultClass(projectedResult)}>{formatThousands(projectedResult)}</strong><small>Prognostiserat saldo 31 december minus saldo 1 januari</small><a href="/reports/liquidity">Visa likviditetsprognos</a></article>
              <article className={styles.dashboardBudgetCard}><span>Utfall mot budget</span><strong className={resultClass(budgetTotals?.variance ?? 0)}>{budgetTotals ? formatThousands(budgetTotals.variance) : "saknas"}</strong><small>{budgetTotals ? `Utfall ${formatThousands(budgetTotals.actual)} mot budget ${formatThousands(budgetTotals.budget)}` : "Ladda upp en .xls-budget på sidan Filer"}</small><a href="/reports/budget">Visa budgetuppföljning</a></article>
            </section>

            <section className={styles.kpis} aria-label="Övriga nyckeltal">
              <article><span>Senast faktiskt saldo</span><strong>{formatThousands(currentCash)}</strong><small>Bank- och kassakonton</small></article>
              <article><span>Senaste utfall</span><strong>{latestDate ?? "saknas"}</strong><small>Senaste bokförda datum</small></article>
              <article><span>Underlag</span><strong>{files.length}</strong><small>Inlästa filer</small></article>
              <article><span>Budget</span><strong>{budget ? budget.year : "saknas"}</strong><small>{budget ? `${budget.rows.length} budgeterade konton` : "Ingen budgetfil"}</small></article>
            </section>

            <article className={`${styles.panel} ${styles.dashboardBudgetPanel}`}>
              <div className={`${styles.panelHeader} ${styles.dashboardPanelHeader}`}><div><span>Budgetuppföljning</span><h2>Vad avviker mest mot budget?</h2></div><a className={styles.panelLink} href="/reports/budget">Öppna hela rapporten</a></div>
              {!budget ? <p className={`${styles.copy} ${styles.dashboardLead}`}>Ladda upp resultatrapporten i `.xls`-format för att se kategoriavvikelser här.</p> : <>
                <p className={`${styles.copy} ${styles.dashboardLead}`}>Grönt betyder bättre resultat än budget. Kostnader är negativa, så en mindre kostnad ger en positiv avvikelse.</p>
                <div className={styles.budgetVarianceChart} aria-label="Avvikelse mot budget per kategori">
                  {categories.map((category) => <div className={styles.budgetVarianceRow} data-tooltip={`${category.label}: ${formatThousands(category.variance)}`} title={`${category.label}: ${formatThousands(category.variance)}`} key={category.id}><strong>{category.label}</strong><div className={styles.categoryChangeTrack}><span className={styles.categoryChangeBaseline} /><span className={category.variance >= 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max(Math.abs(category.variance) / maxVariance * 50, 1)}%` }} /></div><span className={category.variance >= 0 ? styles.betterText : styles.worseText}>{formatThousands(category.variance)}</span></div>)}
                  <div className={`${styles.budgetVarianceRow} ${styles.categoryChangeTotalRow}`}><strong>Resultat</strong><div className={styles.categoryChangeTrack}><span className={styles.categoryChangeBaseline} /><span className={(budgetTotals?.variance ?? 0) >= 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max(Math.abs(budgetTotals?.variance ?? 0) / maxVariance * 50, 1)}%` }} /></div><span className={(budgetTotals?.variance ?? 0) >= 0 ? styles.betterText : styles.worseText}>{formatThousands(budgetTotals?.variance ?? 0)}</span></div>
                </div>
              </>}
            </article>
          </>
        )}
      </section>
    </main>
  );
}
