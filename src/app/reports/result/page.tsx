"use client";

import { ResultComparisonChart } from "@/app/result-comparison-chart";
import { buildResultForecast } from "@/lib/reports/result-forecast";
import { Fragment, useEffect, useMemo, useState } from "react";
import { BarChart3, Bot, CalendarRange, ChevronRight, FileUp, Landmark, LineChart, Settings2, WalletCards } from "lucide-react";
import Link from "next/link";
import { useUploads } from "@/app/upload-context";
import { LogoutLink } from "@/app/logout-link";
import { parseBudgetBuffer } from "@/lib/budget/parser";
import { emptyAccountingDataset, formatThousands, getAvailableYears, loadAccountingDataset } from "@/lib/reports/accounting";
import { buildResultReport, RESULT_GROUPS, type ResultComparison } from "@/lib/reports/result";
import type { AccountingDataset, BudgetDataset } from "@/lib/sie/types";
import styles from "../../page.module.css";

const currency = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isoDate = (date: string) => `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
const tone = (amount: number) => amount > 0 ? styles.betterText : amount < 0 ? styles.worseText : styles.neutralText;

export default function ResultPage() {
  const { files, categories, isLoading, storageError } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(emptyAccountingDataset);
  const [budgets, setBudgets] = useState<BudgetDataset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(0);
  const [selectedBudget, setSelectedBudget] = useState("");
  const [date, setDate] = useState("");
  const [comparison, setComparison] = useState<ResultComparison>("budget");
  const [grouping, setGrouping] = useState("result");
  const [selection, setSelection] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      loadAccountingDataset(files),
      Promise.all(files.filter((file) => file.name.toLowerCase().endsWith(".xls")).map(async (file) => parseBudgetBuffer(new Uint8Array(await file.arrayBuffer()), file.name)))
    ]).then(([nextDataset, nextBudgets]) => {
      if (!active) return;
      setDataset(nextDataset);
      setBudgets(nextBudgets);
      setError(null);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Kunde inte läsa rapportunderlagen"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [files]);

  const years = [...new Set([...getAvailableYears(dataset), ...budgets.map((budget) => budget.year)])].sort((a, b) => b - a);
  const year = years.includes(selectedYear) ? selectedYear : years[0] ?? new Date().getFullYear();
  const yearBudgets = budgets.filter((budget) => budget.year === year);
  const budget = yearBudgets.find((entry) => entry.fileName === selectedBudget) ?? yearBudgets.at(-1);
  const latest = dataset.vouchers.filter((voucher) => voucher.date.startsWith(String(year))).at(-1)?.date;
  const cutoff = date.startsWith(`${year}-`) ? date.replaceAll("-", "") : latest ?? `${year}1231`;
  const reportGroups = grouping === "result" ? RESULT_GROUPS : categories;
  const groups = useMemo(() => buildResultReport(dataset, budget, year, cutoff, comparison, reportGroups, categories), [dataset, budget, year, cutoff, comparison, reportGroups, categories]);
  const visible = groups.filter((group) => selection === null || selection.includes(group.id));
  const lastIncomeGroup = visible.filter((group) => group.accounts.some((row) => row.account.startsWith("3"))).at(-1)?.id;
  const lastDirectCostGroup = visible.filter((group) => group.accounts.some((row) => row.account.startsWith("4"))).at(-1)?.id;
  const lastOperatingGroup = visible.filter((group) => group.accounts.some((row) => /^[3-7]/.test(row.account))).at(-1)?.id;
  const lastFinancialGroup = visible.filter((group) => group.accounts.some((row) => /^[3-7]/.test(row.account) || /^8[0-4]/.test(row.account))).at(-1)?.id;
  const accounts = visible.flatMap((group) => group.accounts);
  const actual = accounts.reduce((sum, row) => sum + row.actual, 0);
  const reference = accounts.reduce((sum, row) => sum + row.comparison, 0);
  const comparisonLabel = comparison === "budget" ? `Årsbudget ${year}` : comparison === "previousYear" ? `Hela ${year - 1}` : `Samma period ${year - 1}`;
  const noReference = comparison === "budget" ? !budget : !getAvailableYears(dataset).includes(year - 1);
  const scale = Math.max(...visible.map((group) => Math.abs(group.variance)), Math.abs(actual - reference), 1);
  const varianceBar = (label: string, variance: number) => noReference ? null : <div className={styles.categoryChangeTrack} title={`${label}: ${currency.format(variance)} kr`}><span className={styles.categoryChangeBaseline} />{variance !== 0 ? <span className={variance > 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max(Math.abs(variance) / scale * 50, 1)}%` }} /> : null}</div>;
  const resultForecast = buildResultForecast(dataset, year, cutoff, accounts.map((account) => account.account));
  let accumulatedReference = 0;
  const referenceCurve = Array.from({ length: 12 }, (_, index) => {
    accumulatedReference += accounts.reduce((sum, account) => sum + account.comparisonMonths[index], 0);
    return { month: index + 1, amount: accumulatedReference };
  }).filter((point) => comparison !== "previousPeriod" || point.month <= Number(cutoff.slice(4, 6)));
  const toggleGroup = (id: string) => setSelection((current) => {
    const selected = current ?? groups.map((group) => group.id);
    return selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
  });
  const resultValues = (codes: (account: string) => boolean) => {
    const subset = accounts.filter((row) => codes(row.account));
    return [subset.reduce((sum, row) => sum + row.actual, 0), subset.reduce((sum, row) => sum + row.comparison, 0)];
  };
  const summaryRow = (label: string, codes: (account: string) => boolean) => {
    const [amount, compared] = resultValues(codes);
    return <tr className={styles.resultSubtotal} key={label}><th scope="row">{label}</th><td>{currency.format(amount)}</td><td>{noReference ? "–" : currency.format(compared)}</td><td /><td className={tone(amount - compared)}>{noReference ? "–" : currency.format(amount - compared)}</td></tr>;
  };

  return <main className={styles.shell}>
    <aside className={styles.sidebar} aria-label="Rapporter">
      <div className={styles.brand}><Landmark size={26} aria-hidden="true" /><div><strong>Kronängs IF</strong><span>Styrelserapport</span></div></div>
      <nav className={styles.nav}>
        <Link href="/"><BarChart3 size={18} aria-hidden="true" />Översikt</Link>
        <Link href="/reports/budget"><WalletCards size={18} aria-hidden="true" />Budget</Link>
        <Link className={styles.active} href="/reports/result" aria-current="page"><BarChart3 size={18} aria-hidden="true" />Resultatrapport</Link>
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
      <header className={styles.topbar}><div><p>{dataset.organizationName}</p><h1>Resultatrapport {year}</h1><span className={styles.fileStatus}>Utfall 1 januari–{isoDate(cutoff)}. Intäkter är positiva och kostnader negativa. Belopp i kronor.</span></div></header>
      {storageError || error ? <p role="alert">{storageError ?? error}</p> : null}
      {isLoading || loading ? <div className={styles.emptyState}>Läser rapportunderlag…</div> : !years.length ? <div className={styles.emptyState}><h2>Inget rapportunderlag</h2><p><Link href="/files">Ladda upp SIE-filer och budget på sidan Filer.</Link></p></div> : <>
        <article className={`${styles.panel} ${styles.resultControls}`}>
          <div className={styles.periodizationChartControls}>
            <label className={styles.periodizationChartSelect}><span>År</span><select value={year} onChange={(event) => { setSelectedYear(Number(event.target.value)); setDate(""); }}>{years.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
            <label className={styles.periodizationChartSelect}><span>Utfall t.o.m.</span><input type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={isoDate(cutoff)} onChange={(event) => setDate(event.target.value)} /></label>
            <label className={styles.periodizationChartSelect}><span>Jämför med</span><select value={comparison} onChange={(event) => setComparison(event.target.value as ResultComparison)}><option value="budget">Årsbudget</option><option value="previousPeriod">Föregående år – samma period</option><option value="previousYear">Hela föregående år</option></select></label>
            <label className={styles.periodizationChartSelect}><span>Gruppering</span><select value={grouping} onChange={(event) => { setGrouping(event.target.value); setSelection(null); setExpanded([]); }}><option value="result">Resultatrapport (enligt PDF)</option><option value="categories">Egna verksamhetskategorier</option></select></label>
            {comparison === "budget" && yearBudgets.length > 1 ? <label className={styles.periodizationChartSelect}><span>Budgetfil</span><select value={budget?.fileName ?? ""} onChange={(event) => setSelectedBudget(event.target.value)}>{yearBudgets.map((entry) => <option key={entry.fileName}>{entry.fileName}</option>)}</select></label> : null}
          </div>
          {comparison === "budget" ? <p className={styles.fileStatus}>Jämförelsekolumnen visar hela årsbudgeten. Budgetkurvan använder samma historiska månadsfördelning som budgetsidan, även när du byter gruppering. Om historik saknas fördelas budgeten jämnt över året.</p> : <p className={styles.fileStatus}>{comparison === "previousPeriod" ? "Jämförelsen avser samma period föregående år." : "Jämförelsen avser hela föregående år."}</p>}
          {comparison === "budget" && budget ? <p className={styles.fileStatus}>Budgetunderlag: {budget.fileName}</p> : null}
          {noReference ? <p role="status">{comparison === "budget" ? `Budget för ${year} saknas. Ladda upp budgetfilen under Filer.` : `SIE-underlag för ${year - 1} saknas. Ladda upp föregående års fil under Filer.`}</p> : null}
          <details className={styles.resultFilters}><summary>Välj grupper att jämföra ({visible.length} av {groups.length})</summary><div><button type="button" onClick={() => setSelection(null)}>Visa alla</button><button type="button" onClick={() => setSelection([])}>Avmarkera alla</button>{groups.map((group) => <label key={group.id}><input type="checkbox" checked={selection === null || selection.includes(group.id)} onChange={() => toggleGroup(group.id)} />{group.label}</label>)}</div></details>
        </article>
        <section className={styles.kpis} aria-label="Resultat för valda grupper">
          <article><span>{selection === null ? "Bokfört resultat hittills" : "Resultat för valda grupper"}</span><strong className={tone(actual)}>{formatThousands(actual)}</strong><small>Utfall t.o.m. {isoDate(cutoff)}</small></article>
          <article><span>{comparisonLabel}</span><strong>{noReference ? "–" : formatThousands(reference)}</strong><small>Jämförelse för valda grupper</small></article>
          <article><span>Avvikelse</span><strong className={noReference ? undefined : tone(actual - reference)}>{noReference ? "–" : formatThousands(actual - reference)}</strong><small>Utfall minus jämförelse</small></article>
          <article><span>Senaste bokföringsdatum</span><strong>{latest ? isoDate(latest) : "–"}</strong><small>{accounts.length} konton i valda grupper</small></article>
        </section>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><h2>{comparison === "budget" ? "Resultat och prognos jämfört med budget" : "Resultat och prognos jämfört med föregående år"}</h2></div>
          <p className={styles.chartExplanation}>Resultat är intäkter minus kostnader. Varje punkt visar det sammanlagda resultatet från januari, inte pengar på banken eller hur mycket ni får spendera.{comparison === "budget" ? " Lila över blått betyder ett bättre resultat än planerat. Kurvan visar periodiserad budget, medan tabellen och kortet Årsbudget visar hela årets budget." : " Lila visar årets bokförda resultat och blått visar föregående års resultat."}</p>
          <div className={styles.periodizationLegend}><span><i className={styles.periodizationActualDot} /> Faktiskt resultat (utfall)</span><span><i className={styles.resultForecastSwatch} /> Prognostiserat resultat</span>{!noReference ? <span><i className={styles.periodizationBudgetDot} /> {comparison === "budget" ? "Budgeterat resultat (periodiserat)" : comparisonLabel}</span> : null}</div>
          <ResultComparisonChart reference={noReference ? [] : referenceCurve} referenceLabel={comparisonLabel} actual={resultForecast.actualPoints} forecast={resultForecast.forecastPoints} />
          <p className={styles.chartExplanation}>{resultForecast.projectedResult === null ? "Resultatprognos saknas: ladda upp årets och föregående års SIE-underlag." : "Den streckade lila linjen visar prognostiserat resultat för valda grupper: bokfört resultat till valt datum, dock senast till senaste bokföringsdatum, plus föregående års intäkter och kostnader för återstoden av året. Prognosen avser resultat, inte bank och kassa."}</p>
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><h2>Resultat per {grouping === "result" ? "redovisningsgrupp" : "kategori"}</h2><button type="button" onClick={() => setExpanded(expanded.length ? [] : visible.map((group) => group.id))}>{expanded.length ? "Dölj konton" : "Visa alla konton"}</button></div>
          {!visible.length ? <p>Inga grupper valda.</p> : null}
          <div className={styles.resultTableScroll}><table className={styles.resultTable}><thead><tr><th scope="col">Grupp / konto</th><th scope="col">Utfall</th><th scope="col">{comparisonLabel}</th><th scope="col" aria-label="Avvikelsediagram" /><th scope="col">Avvikelse</th></tr></thead><tbody>
            {visible.map((group) => <Fragment key={group.id}>
              <tr className={styles.resultGroup}><th scope="row"><button className={styles.accountDetailToggle} type="button" aria-expanded={expanded.includes(group.id)} onClick={() => setExpanded((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])}><span>{group.label}</span><ChevronRight size={16} className={expanded.includes(group.id) ? styles.categoryChevronOpen : undefined} /></button></th><td>{currency.format(group.actual)}</td><td>{noReference ? "–" : currency.format(group.comparison)}</td><td className={styles.resultBarCell}>{varianceBar(group.label, group.variance)}</td><td className={tone(group.variance)}>{noReference ? "–" : currency.format(group.variance)}</td></tr>
              {expanded.includes(group.id) ? group.accounts.map((account) => <tr key={account.account}><th scope="row" className={styles.resultAccount}>{account.account} · {account.name}</th><td>{currency.format(account.actual)}</td><td>{noReference ? "–" : currency.format(account.comparison)}</td><td /><td className={tone(account.variance)}>{noReference ? "–" : currency.format(account.variance)}</td></tr>) : null}
              {grouping === "result" && group.id === lastIncomeGroup ? summaryRow("Summa rörelsens intäkter", (code) => code.startsWith("3")) : null}
              {grouping === "result" && group.id === lastDirectCostGroup ? summaryRow("Bruttovinst", (code) => /^[34]/.test(code)) : null}
              {grouping === "result" && group.id === lastOperatingGroup ? summaryRow("Rörelseresultat", (code) => /^[3-7]/.test(code)) : null}
              {grouping === "result" && group.id === lastFinancialGroup ? summaryRow("Resultat efter finansiella poster", (code) => /^[3-7]/.test(code) || /^8[0-4]/.test(code)) : null}
            </Fragment>)}
            {grouping === "result" ? summaryRow("Summa rörelsens kostnader", (code) => /^[4-8]/.test(code)) : null}
          </tbody><tfoot><tr><th scope="row">{selection === null ? "Beräknat resultat" : "Resultat för valda grupper"}</th><td>{currency.format(actual)}</td><td>{noReference ? "–" : currency.format(reference)}</td><td className={styles.resultBarCell}>{varianceBar("Resultat", actual - reference)}</td><td className={tone(actual - reference)}>{noReference ? "–" : currency.format(actual - reference)}</td></tr></tfoot></table></div>
        </article>
      </>}
    </section>
  </main>;
}
