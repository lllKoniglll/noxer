"use client";

import { ResultComparisonChart } from "@/app/result-comparison-chart";
import { buildResultForecast } from "@/lib/reports/result-forecast";
import { Fragment, useEffect, useMemo, useState } from "react";
import { BarChart3, Bot, CalendarRange, ChevronRight, FileUp, Landmark, LineChart, Settings2, WalletCards } from "lucide-react";
import Link from "next/link";
import { useUploads } from "@/app/upload-context";
import { LogoutLink } from "@/app/logout-link";
import { parseBudgetBuffer } from "@/lib/budget/parser";
import { buildAccountTransactions, buildBudgetAccountSummary, buildBudgetPeriodization, emptyAccountingDataset, formatThousands, loadAccountingDataset, type BudgetPeriodizationMode } from "@/lib/reports/accounting";
import { getAccountCategory } from "@/lib/reports/categories";
import type { AccountingDataset, BudgetDataset } from "@/lib/sie/types";
import styles from "../../page.module.css";

type PeriodView = "toDate" | "fullYear";

function amountClass(value: number): string | undefined {
  if (value > 0) return styles.incomeText;
  if (value < 0) return styles.costText;
  return undefined;
}

const SWEDISH_MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function transactionMonth(date: string): number {
  const month = SWEDISH_MONTHS.indexOf(date.toLowerCase().trim().split(/\s+/)[1]);
  return month + 1;
}

export default function BudgetAnnualPage() {
  const { files, categories } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());
  const [budgets, setBudgets] = useState<BudgetDataset[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const periodizationMode: BudgetPeriodizationMode = "history";
  const [periodView, setPeriodView] = useState<PeriodView>("toDate");
  const [chartCategory, setChartCategory] = useState("total");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

  useEffect(() => { void loadAccountingDataset(files).then(setDataset); }, [files]);
  useEffect(() => {
    let active = true;
    void Promise.all(files.filter((file) => file.name.toLowerCase().endsWith(".xls")).map(async (file) => {
      try { return parseBudgetBuffer(new Uint8Array(await file.arrayBuffer()), file.name); } catch { return null; }
    })).then((result) => {
      if (!active) return;
      const valid = result.filter((budget): budget is BudgetDataset => budget !== null);
      setBudgets(valid);
      setSelectedFile((current) => valid.some((budget) => budget.fileName === current) ? current : valid.at(-1)?.fileName ?? "");
    });
    return () => { active = false; };
  }, [files]);

  const budget = budgets.find((entry) => entry.fileName === selectedFile) ?? budgets.at(-1);
  const report = useMemo(() => budget ? buildBudgetPeriodization(dataset, budget, categories, periodizationMode) : null, [dataset, budget, categories, periodizationMode]);
  const budgetAccounts = useMemo(() => budget ? buildBudgetAccountSummary(dataset, budget) : [], [dataset, budget]);
  const accountRows = useMemo(() => {
    if (!budget) return [];
    const rows = new Map(budgetAccounts.map((account) => [account.account, account]));
    const transactionAccounts = new Set(dataset.vouchers.flatMap((voucher) => voucher.transactions.map((transaction) => transaction.account)));
    for (const account of new Set([...dataset.accounts.keys(), ...transactionAccounts])) {
      if (!/^[3-8]/.test(account) || rows.has(account)) continue;
      const actual = buildAccountTransactions(dataset, [account]).reduce((sum, transaction) => sum + (transaction.years[String(budget.year)] ?? 0), 0);
      if (actual !== 0) rows.set(account, { account, name: dataset.accounts.get(account)?.name ?? "Okänt konto", budget: 0, actual, variance: actual });
    }
    return Array.from(rows.values()).sort((left, right) => Math.abs(right.budget || right.actual) - Math.abs(left.budget || left.actual) || left.account.localeCompare(right.account, "sv", { numeric: true }));
  }, [budget, budgetAccounts, dataset]);
  const visibleMonths = report ? periodView === "toDate" ? report.months.slice(0, report.latestMonth || 12) : report.months : [];
  const totals = visibleMonths.reduce((sum, month) => ({ budget: sum.budget + month.budget, actual: sum.actual + month.actual, variance: sum.variance + month.variance }), { budget: 0, actual: 0, variance: 0 });
  const availableCategories = report ? report.categories : [];
  const selectedChartCategory = availableCategories.find((category) => category.id === chartCategory);
  const forecastAccounts = chartCategory === "total" ? undefined : Array.from(new Set(dataset.vouchers.flatMap((voucher) => voucher.transactions.map((transaction) => transaction.account)))).filter((account) => getAccountCategory(account, categories).id === chartCategory);
  const resultForecast = buildResultForecast(dataset, budget?.year ?? new Date().getFullYear(), undefined, forecastAccounts);
  let accumulatedBudget = 0;
  const budgetCurve = (report?.months ?? []).map((month, index) => {
    accumulatedBudget += selectedChartCategory ? selectedChartCategory.periodized[index] ?? 0 : month.budget;
    return { month: index + 1, amount: accumulatedBudget };
  });
  const categoryRows = availableCategories.map((category) => {
    const periodized = visibleMonths.reduce((sum, month) => sum + (category.periodized[month.month - 1] ?? 0), 0);
    const actual = visibleMonths.reduce((sum, month) => sum + (category.actual[month.month - 1] ?? 0), 0);
    return { ...category, periodized, actual, variance: actual - periodized };
  }).filter((category) => category.budget !== 0 || category.actual !== 0) ?? [];
  useEffect(() => {
    setExpandedCategory(chartCategory === "total" ? null : chartCategory);
    setExpandedAccount(null);
  }, [chartCategory]);
  const accountActualForView = (account: string) => buildAccountTransactions(dataset, [account]).reduce((sum, transaction) => {
    const month = transactionMonth(transaction.date);
    return transaction.years[String(budget?.year)] !== undefined && (periodView === "fullYear" || month <= (report?.latestMonth || 12)) ? sum + (transaction.years[String(budget?.year)] ?? 0) : sum;
  }, 0);
  const maxCategoryVariance = Math.max(...categoryRows.map((category) => Math.abs(category.variance)), Math.abs(totals.variance), 1);

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Rapporter">
        <div className={styles.brand}><Landmark size={26} aria-hidden="true" /><div><strong>Kronängs IF</strong><span>Styrelserapport</span></div></div>
        <nav className={styles.nav}>
          <Link href="/"><BarChart3 size={18} aria-hidden="true" />Översikt</Link>
          <Link className={styles.active} href="/reports/budget"><WalletCards size={18} aria-hidden="true" />Budget</Link>
          <Link href="/reports/result"><BarChart3 size={18} aria-hidden="true" />Resultatrapport</Link>
          <Link href="/reports/liquidity"><LineChart size={18} aria-hidden="true" />Likviditet</Link>
          <Link href="/reports/categories"><CalendarRange size={18} aria-hidden="true" />Kategorier</Link>
          <Link href="/reports/monthly"><BarChart3 size={18} aria-hidden="true" />Månadsöversikt</Link>
          <Link href="/reports/accounts"><BarChart3 size={18} aria-hidden="true" />Kontojämförelse</Link>
          <Link href="/chat"><Bot size={18} aria-hidden="true" />Chat</Link>
          <Link href="/files"><FileUp size={18} aria-hidden="true" />Filer</Link>
          <Link href="/categories"><Settings2 size={18} aria-hidden="true" />Redigera kategorier</Link>
          <LogoutLink />
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><p>{dataset.organizationName}</p><h1>Budget {budget?.year ?? ""}</h1><span className={styles.fileStatus}>{budget ? "Budgeten fördelas per månad utifrån genomsnittlig historik från de senaste tillgängliga åren och jämförs med faktiskt utfall för vald period. Om historik saknas fördelas budgeten jämnt över året." : "Ladda upp en budgetfil på sidan Filer"}</span></div>
          <div className={styles.actions}>
            {budgets.length > 1 ? <label className={styles.budgetSelect}><span>Budgetfil</span><select value={selectedFile} onChange={(event) => setSelectedFile(event.target.value)}>{budgets.map((entry) => <option key={entry.fileName} value={entry.fileName}>{entry.fileName} ({entry.year})</option>)}</select></label> : null}
          </div>
        </header>

        {!budget || !report ? <div className={styles.emptyState}><WalletCards size={32} aria-hidden="true" /><h2>Ingen budget uppladdad</h2><p>Ladda upp den tab-separerade resultatrapporten i Excel-format på sidan Filer.</p></div> : <>
          <section className={styles.kpis} aria-label="Periodiserad budget">
            <article><span>Budgeterat resultat</span><strong className={amountClass(totals.budget)}>{formatThousands(totals.budget)}</strong><small>{periodView === "toDate" ? "Planerat resultat t.o.m. senaste bokföringsmånaden" : "Planerat resultat för hela året"}</small></article>
            <article><span>Faktiskt resultat</span><strong className={amountClass(totals.actual)}>{formatThousands(totals.actual)}</strong><small>Bokförda intäkter minus bokförda kostnader</small></article>
            <article><span>Avvikelse</span><strong className={amountClass(totals.variance)}>{formatThousands(totals.variance)}</strong><small>Utfall minus periodiserad budget</small></article>
            <article><span>Periodisering</span><strong>{periodizationMode === "history" ? "Historik" : "Rak"}</strong><small>{periodizationMode === "history" ? "Historiska månadsandelar" : "En tolftedel per månad"}</small></article>
          </section>

          <article className={styles.panel}>
            <div className={styles.panelHeader}><h2>Resultat och prognos jämfört med budget</h2></div>
            <p className={styles.chartExplanation}>Här visas intäkter minus kostnader, inte hur mycket ni får spendera. Budget är planen; utfall är det som faktiskt bokförts. Varje punkt summerar från januari. Den heldragna lila linjen slutar vid senaste bokföringsdatum; den streckade fortsätter med prognosen till december.</p>
            <div className={styles.periodizationChartControls}>
              <label className={styles.periodizationChartSelect}><span>Visa diagram för</span><select value={chartCategory} onChange={(event) => setChartCategory(event.target.value)}><option value="total">Totalt</option>{availableCategories.filter((category) => category.budget !== 0 || category.actual.some((value) => value !== 0)).map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
              <label className={styles.periodizationChartSelect}><span>Period i tabellen och korten</span><select value={periodView} onChange={(event) => setPeriodView(event.target.value as PeriodView)}><option value="toDate">Fram till senaste transaktion</option><option value="fullYear">Hela året</option></select></label>
            </div>
            <div className={styles.periodizationLegend}><span><i className={styles.periodizationBudgetDot} /> Budgeterat resultat</span><span><i className={styles.periodizationActualDot} /> Faktiskt resultat (utfall)</span><span><i className={styles.resultForecastSwatch} /> Prognostiserat resultat</span><span><i className={styles.periodizationFavorableSwatch} /> Bättre än budget</span><span><i className={styles.periodizationUnfavorableSwatch} /> Sämre än budget</span></div>
            <p className={styles.chartExplanation}>Lila över blått betyder bättre resultat än planerat: högre intäkter eller lägre kostnader. Därför är ytan grön. Lila under blått ger en röd yta. Kostnader visas som minusbelopp, så en mindre negativ kostnad innebär ett bättre resultat.</p>
            <p className={styles.chartExplanation}>Budgeten fördelas efter historiska månadsandelar och omfattar hela den sista månaden. Utfallet omfattar bara bokförda transaktioner; skillnaden kan därför också bero på när intäkter och kostnader bokförs.</p>
            <ResultComparisonChart reference={budgetCurve} referenceLabel="Budgeterat resultat" actual={resultForecast.actualPoints} forecast={resultForecast.forecastPoints} shade />
            <p className={styles.chartExplanation}>{resultForecast.projectedResult === null ? "Resultatprognos saknas: ladda upp årets och föregående års SIE-underlag." : "Den streckade lila linjen visar prognostiserat resultat för vald kategori eller totalt: bokfört resultat till senaste bokföringsdatum plus föregående års intäkter och kostnader för återstoden av året. Prognosen avser resultat, inte bank och kassa."}</p>
          </article>

          <article className={`${styles.panel} ${styles.annualCategoryPanel}`}>
            <div className={styles.categoryChangeChart} aria-label="Liggande stapeldiagram över periodiserad budget och avvikelse per kategori"><div className={styles.categoryChangeHeader}><span>Kategori</span><span>Periodiserad budget</span><span>Avvikelse</span></div>{categoryRows.map((category) => {
              const isExpanded = expandedCategory === category.id;
              const categoryAccounts = isExpanded ? accountRows.filter((account) => category.id === "unbudgeted" ? account.budget === 0 : getAccountCategory(account.account, categories).id === category.id) : [];
              return <div className={styles.categoryChangeItem} key={category.id}><button className={styles.categoryChangeRow} onClick={() => { setChartCategory(isExpanded ? "total" : category.id); setExpandedCategory(isExpanded ? null : category.id); setExpandedAccount(null); }} type="button" aria-expanded={isExpanded} title={`${category.label}: ${formatThousands(category.variance)}`}><strong className={styles.categoryChangeLabel}><span>{category.label}</span><ChevronRight className={isExpanded ? styles.categoryChevronOpen : undefined} size={16} aria-hidden="true" /></strong><span className={styles.categoryCurrentValue}>{formatThousands(category.periodized)}</span><div className={styles.categoryChangeTrack}><span className={styles.categoryChangeBaseline} />{category.variance !== 0 ? <span className={category.variance > 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max(Math.abs(category.variance) / maxCategoryVariance * 50, 1)}%` }} /> : null}</div><span className={category.variance > 0 ? styles.betterText : category.variance < 0 ? styles.worseText : styles.neutralText}>{formatThousands(category.variance)}</span></button>{isExpanded ? <div className={styles.chartCategoryDetails}><strong>Konton i {category.label}</strong><table className={styles.categoryDetailsTable}><thead><tr><th>Konto</th><th>Årsbudget</th><th>Periodiserad budget</th><th>Utfall</th><th>Avvikelse</th></tr></thead><tbody>{categoryAccounts.map((account) => {
                const accountIsExpanded = expandedAccount === account.account;
                const accountActual = accountActualForView(account.account);
                const accountPeriodized = category.budget !== 0 ? account.budget * category.periodized / category.budget : 0;
                const accountVariance = accountActual - accountPeriodized;
                const transactions = accountIsExpanded ? buildAccountTransactions(dataset, [account.account]).filter((transaction) => {
                  const month = transactionMonth(transaction.date);
                  return (transaction.years[String(budget.year)] ?? 0) !== 0 && (periodView === "fullYear" || month <= (report.latestMonth || 12));
                }) : [];
                return <Fragment key={account.account}><tr><td><button className={styles.accountDetailToggle} onClick={() => setExpandedAccount(accountIsExpanded ? null : account.account)} type="button" aria-expanded={accountIsExpanded}><ChevronRight className={accountIsExpanded ? styles.categoryChevronOpen : undefined} size={15} aria-hidden="true" />{account.account} · {account.name}</button></td><td className={amountClass(account.budget)}>{formatThousands(account.budget)}</td><td className={amountClass(accountPeriodized)}>{formatThousands(accountPeriodized)}</td><td className={amountClass(accountActual)}>{formatThousands(accountActual)}</td><td className={amountClass(accountVariance)}>{formatThousands(accountVariance)}</td></tr>{accountIsExpanded ? <tr><td colSpan={5}><div className={styles.transactionDetails}><strong>Transaktioner för {account.account}</strong><table><thead><tr><th>Datum</th><th>Verifikation</th><th>Text</th><th>Utfall</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={`${transaction.date}-${transaction.voucher}-${transaction.text}`}><td>{transaction.date}</td><td>{transaction.voucher}</td><td>{transaction.text}</td><td className={amountClass(transaction.years[String(budget.year)] ?? 0)}>{formatThousands(transaction.years[String(budget.year)] ?? 0)}</td></tr>)}</tbody></table></div></td></tr> : null}</Fragment>;
              })}</tbody><tfoot><tr><td>Total</td><td className={amountClass(category.budget)}>{formatThousands(category.budget)}</td><td className={amountClass(category.periodized)}>{formatThousands(category.periodized)}</td><td className={amountClass(category.actual)}>{formatThousands(category.actual)}</td><td className={amountClass(category.variance)}>{formatThousands(category.variance)}</td></tr></tfoot></table></div> : null}</div>;
            })}<div className={`${styles.categoryChangeRow} ${styles.categoryChangeTotalRow}`} data-tooltip={`Resultat: ${formatThousands(totals.variance)}`} title={`Resultat: ${formatThousands(totals.variance)}`}><strong>Resultat</strong><span className={styles.categoryCurrentValue}>{formatThousands(totals.budget)}</span><div className={styles.categoryChangeTrack}><span className={styles.categoryChangeBaseline} /><span className={totals.variance >= 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max(Math.abs(totals.variance) / maxCategoryVariance * 50, 1)}%` }} /></div><span className={totals.variance >= 0 ? styles.betterText : styles.worseText}>{formatThousands(totals.variance)}</span></div></div>
          </article>
        </>}
      </section>
    </main>
  );
}
