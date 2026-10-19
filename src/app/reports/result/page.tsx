"use client";

import { ResultComparisonChart } from "@/app/result-comparison-chart";
import { buildBudgetResultCurve, buildPreviousYearResultCurve, buildResultForecast } from "@/lib/reports/result-forecast";
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { BarChart3, Bot, ChevronRight, FileUp, Landmark, LineChart, Settings2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUploads } from "@/app/upload-context";
import { LogoutLink } from "@/app/logout-link";
import { parseBudgetBuffer } from "@/lib/budget/parser";
import { emptyAccountingDataset, formatThousands, getAvailableYears, loadAccountingDataset } from "@/lib/reports/accounting";
import { buildResultAccountTransactions, buildResultReport, RESULT_GROUPS, type ResultComparison } from "@/lib/reports/result";
import type { AccountingDataset, BudgetDataset } from "@/lib/sie/types";
import styles from "../../page.module.css";

const currency = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isoDate = (date: string) => `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
const tone = (amount: number) => amount > 0 ? styles.betterText : amount < 0 ? styles.worseText : styles.neutralText;

function ResultPageContent() {
  const params = useSearchParams();
  const { files, categories, isLoading, storageError } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(emptyAccountingDataset);
  const [budgets, setBudgets] = useState<BudgetDataset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(0);
  const [selectedBudget, setSelectedBudget] = useState("");
  const [date, setDate] = useState("");
  const [comparison, setComparison] = useState<ResultComparison>(() => {
    const requested = params.get("comparison");
    return requested === "budget" || requested === "periodizedBudget" || requested === "previousYear" ? requested : "previousPeriod";
  });
  const isBudget = comparison === "budget" || comparison === "periodizedBudget";
  const [grouping, setGrouping] = useState(params.get("grouping") === "report" ? "report" : "categories");
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

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
  const reportGroups = grouping === "report" ? RESULT_GROUPS : categories;
  const groups = useMemo(() => buildResultReport(dataset, budget, year, cutoff, comparison, reportGroups, categories), [dataset, budget, year, cutoff, comparison, reportGroups, categories]);
  const visible = groups.filter((group) => selection === null || selection.includes(group.id));
  const accounts = visible.flatMap((group) => group.accounts);
  const chartGroup = visible.find((group) => group.id === activeGroupId);
  const chartAccounts = chartGroup?.accounts ?? accounts;
  const actual = accounts.reduce((sum, row) => sum + row.actual, 0);
  const reference = accounts.reduce((sum, row) => sum + row.comparison, 0);
  const comparisonLabel = comparison === "periodizedBudget" ? "Periodiserad budget" : comparison === "budget" ? `Årsbudget ${year}` : comparison === "previousYear" ? `Hela ${year - 1}` : `Samma period ${year - 1}`;
  const noReference = isBudget ? !budget : !getAvailableYears(dataset).includes(year - 1);
  const scale = Math.max(...visible.map((group) => Math.abs(group.variance)), ...accounts.map((account) => Math.abs(account.variance)), Math.abs(actual - reference), 1);
  const varianceBar = (label: string, variance: number) => noReference ? null : <div className={styles.categoryChangeTrack} title={`${label}: ${currency.format(variance)} kr`}><span className={styles.categoryChangeBaseline} />{variance !== 0 ? <span className={variance > 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.abs(variance) / scale * 50}%` }} /> : null}</div>;
  const resultForecast = buildResultForecast(dataset, year, cutoff, chartAccounts.map((account) => account.account));
  const summaryForecast = chartGroup ? buildResultForecast(dataset, year, cutoff, accounts.map((account) => account.account)) : resultForecast;
  const periodGroups = useMemo(() => buildResultReport(dataset, budget, year, cutoff, isBudget ? "periodizedBudget" : "previousPeriod", reportGroups, categories), [dataset, budget, year, cutoff, isBudget, reportGroups, categories]);
  const periodVariance = periodGroups.filter((group) => selection === null || selection.includes(group.id)).reduce((sum, group) => sum + group.variance, 0);
  const annualBudgetGroups = useMemo(() => buildResultReport(dataset, budget, year, cutoff, "budget", reportGroups, categories), [dataset, budget, year, cutoff, reportGroups, categories]);
  const annualBudget = annualBudgetGroups.filter((group) => selection === null || selection.includes(group.id)).reduce((sum, group) => sum + group.comparison, 0);
  const projectedBudgetVariance = budget && summaryForecast.projectedResult !== null ? summaryForecast.projectedResult - annualBudget : null;
  const budgetCurve = buildBudgetResultCurve(Array.from({ length: 12 }, (_, index) => chartAccounts.reduce((sum, account) => sum + account.comparisonMonths[index], 0)), year, cutoff);
  const referenceCurve = isBudget ? budgetCurve : buildPreviousYearResultCurve(dataset, year, resultForecast.cutoff ?? cutoff, chartAccounts.map((account) => account.account));
  const chartReferenceLabel = isBudget ? "Budgeterat resultat (periodiserat)" : `Föregående år ${year - 1}`;
  const toggleGroup = (id: string) => setSelection((current) => {
    const selected = current ?? groups.map((group) => group.id);
    return selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
  });
  const compareFullYear = comparison === "budget" || comparison === "previousYear";
  const changeComparison = (budgetSelected: boolean, fullYear: boolean) => {
    setComparison(budgetSelected ? fullYear ? "budget" : "periodizedBudget" : fullYear ? "previousYear" : "previousPeriod");
    setExpandedAccount(null);
  };
  const changeGrouping = (nextGrouping: string) => {
    setGrouping(nextGrouping);
    setSelection(null);
    setActiveGroupId(null);
    setExpandedAccount(null);
  };
  const resetFilters = () => {
    setSelectedYear(0);
    setSelectedBudget("");
    setDate("");
    setSelection(null);
    setGrouping("categories");
    setActiveGroupId(null);
    setExpandedAccount(null);
    changeComparison(false, false);
  };
  const focusCategoryChart = (id: string) => {
    setActiveGroupId((current) => current === id ? null : id);
    setExpandedAccount(null);
  };
  const clearCategoryChart = () => {
    setActiveGroupId(null);
    setExpandedAccount(null);
  };
  const lastGroup = (predicate: (account: string) => boolean) => visible.filter((group) => group.accounts.some((row) => predicate(row.account))).at(-1)?.id;
  const income = (account: string) => account.startsWith("3");
  const directCosts = (account: string) => account.startsWith("4");
  const operating = (account: string) => /^[3-7]/.test(account);
  const financial = (account: string) => operating(account) || /^8[0-4]/.test(account);
  const summaryRow = (label: string, predicate: (account: string) => boolean) => {
    const rows = accounts.filter((row) => predicate(row.account));
    const actual = rows.reduce((sum, row) => sum + row.actual, 0);
    const reference = rows.reduce((sum, row) => sum + row.comparison, 0);
    return <tr className={styles.resultSubtotal}><th scope="row">{label}</th><td>{currency.format(actual)}</td><td>{noReference ? "–" : currency.format(reference)}</td><td /><td className={tone(actual - reference)}>{noReference ? "–" : currency.format(actual - reference)}</td></tr>;
  };

  return <main className={styles.shell}>
    <aside className={styles.sidebar} aria-label="Rapporter">
      <div className={styles.brand}><Landmark size={26} aria-hidden="true" /><div><strong>Kronängs IF</strong><span>Styrelserapport</span></div></div>
      <nav className={styles.nav}>
        <Link href="/"><BarChart3 size={18} aria-hidden="true" />Översikt</Link>
        <Link className={styles.active} href="/reports/result" aria-current="page"><BarChart3 size={18} aria-hidden="true" />Resultatrapport</Link>
        <Link href="/reports/liquidity"><LineChart size={18} aria-hidden="true" />Likviditet</Link>
        <Link href="/reports/accounts"><BarChart3 size={18} aria-hidden="true" />Kontojämförelse</Link>
        <Link href="/chat"><Bot size={18} aria-hidden="true" />Chat</Link>
        <Link href="/files"><FileUp size={18} aria-hidden="true" />Filer</Link>
        <Link href="/categories"><Settings2 size={18} aria-hidden="true" />Redigera kategorier</Link>
        <LogoutLink />
      </nav>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.topbar}><div><p>{dataset.organizationName}</p><h1>Resultatrapport {year}</h1><span className={styles.fileStatus}>Bokfört utfall från årets början till valt datum. Intäkter är positiva och kostnader negativa. Belopp i kronor.</span></div></header>
      {storageError || error ? <p role="alert">{storageError ?? error}</p> : null}
      {isLoading || loading ? <div className={styles.emptyState}>Läser rapportunderlag…</div> : !years.length ? <div className={styles.emptyState}><h2>Inget rapportunderlag</h2><p><Link href="/files">Ladda upp SIE-filer och budget på sidan Filer.</Link></p></div> : <>
        <article className={`${styles.panel} ${styles.resultControls}`}>
          <div className={styles.resultMainChoices}>
          <fieldset className={styles.resultComparisonChoice}>
            <legend>Jämför med</legend>
            <div><label><input type="radio" name="result-comparison" checked={isBudget} onChange={() => changeComparison(true, compareFullYear)} /><span>Budget</span></label><label><input type="radio" name="result-comparison" checked={!isBudget} onChange={() => changeComparison(false, compareFullYear)} /><span>Föregående år</span></label></div>
          </fieldset>
          <fieldset className={styles.resultComparisonChoice}>
            <legend>Kategori</legend>
            <div><label><input type="radio" name="result-category" checked={grouping === "report"} onChange={() => changeGrouping("report")} /><span>Redovisning</span></label><label><input type="radio" name="result-category" checked={grouping === "categories"} onChange={() => changeGrouping("categories")} /><span>Verksamhet</span></label></div>
          </fieldset>
          </div>
          <p className={styles.resultContext}>{compareFullYear ? "Jämförelse med hela året" : "Jämförelse för samma period"} · {selection === null ? grouping === "report" ? "Alla redovisningsgrupper" : "Alla kategorier" : `${visible.length} valda grupper`}</p>
          {noReference ? <p role="status">{isBudget ? "Budgetunderlag för valt år saknas. Ladda upp budgetfilen under Filer." : "Underlag för föregående år saknas. Ladda upp SIE-filen under Filer."}</p> : null}
          <details className={styles.resultAdvanced}>
            <summary>Fler inställningar</summary>
            <div className={styles.periodizationChartControls}>
              <label className={styles.periodizationChartSelect}><span>År</span><select value={year} onChange={(event) => { setSelectedYear(Number(event.target.value)); setDate(""); setExpandedAccount(null); }}>{years.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
              <label className={styles.periodizationChartSelect}><span>Utfall t.o.m.</span><input type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={isoDate(cutoff)} onChange={(event) => setDate(event.target.value)} /></label>
              {isBudget && yearBudgets.length > 1 ? <label className={styles.periodizationChartSelect}><span>Budgetfil</span><select value={budget?.fileName ?? ""} onChange={(event) => setSelectedBudget(event.target.value)}>{yearBudgets.map((entry) => <option key={entry.fileName}>{entry.fileName}</option>)}</select></label> : null}
            </div>
            <label className={styles.resultFullYear}><input type="checkbox" checked={compareFullYear} onChange={(event) => changeComparison(isBudget, event.target.checked)} />Jämför med hela året</label>
            <details className={styles.resultFilters}><summary>Välj grupper ({visible.length} av {groups.length})</summary><div><button type="button" onClick={() => setSelection(null)}>Visa alla</button><button type="button" onClick={() => setSelection([])}>Avmarkera alla</button>{groups.map((group) => <label key={group.id}><input type="checkbox" checked={selection === null || selection.includes(group.id)} onChange={() => toggleGroup(group.id)} />{group.label}</label>)}</div></details>
            {grouping === "categories" ? <p className={styles.fileStatus}>Kategorierna kommer från arbetsytans kategorifil. <Link href="/categories">Redigera kategorier</Link></p> : <p className={styles.fileStatus}>Redovisningsgrupperna följer indelningen i resultatrapporten, med samma konton och gruppnamn.</p>}
            {isBudget && budget ? <p className={styles.fileStatus}>Budgetjämförelsen bygger på arbetsytans budgetunderlag för valt år.</p> : null}
            <button className={styles.resultReset} type="button" onClick={resetFilters}>Återställ inställningar</button>
          </details>
        </article>
        <section className={`${styles.kpis} ${styles.resultKpis}`} aria-label="Resultat för valda grupper">
          <article><span>Senaste bokföringsdatum</span><strong>{latest ? isoDate(latest) : "–"}</strong><small>Senaste bokförda datum för valt år</small></article>
          <article><span>{isBudget ? "Periodens avvikelse mot budget" : "Periodens skillnad mot föregående år"}</span><strong className={noReference ? undefined : tone(periodVariance)}>{noReference ? "–" : formatThousands(periodVariance)}</strong><small>{isBudget ? "Bokfört resultat minus periodiserad budget till valt datum. Utan prognos." : "Bokfört resultat minus samma period föregående år, till valt datum. Utan prognos."}</small></article>
          <article className={styles.overviewForecastCard}><span>Prognostiserat resultat</span><strong className={summaryForecast.projectedResult === null ? undefined : tone(summaryForecast.projectedResult)}>{summaryForecast.projectedResult === null ? "saknas" : formatThousands(summaryForecast.projectedResult)}</strong><small>Helårsprognos för valda grupper: bokfört resultat plus föregående års intäkter och kostnader för resten av året.</small></article>
          <article className={styles.overviewForecastCard}><span>Helårsprognos mot årsbudget</span><strong className={projectedBudgetVariance === null ? undefined : tone(projectedBudgetVariance)}>{projectedBudgetVariance === null ? "saknas" : formatThousands(projectedBudgetVariance)}</strong><small>{!budget ? "Budgetunderlag för valt år saknas." : summaryForecast.projectedResult === null ? "Prognosunderlag saknas." : "Prognostiserat resultat för hela året minus hela årsbudgeten, för valda grupper. Inklusive prognos. Plus betyder bättre än budget."}</small></article>
        </section>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><h2>{isBudget ? "Resultat och prognos jämfört med budget" : "Resultat och prognos jämfört med föregående år"}{chartGroup ? ` · ${chartGroup.label}` : ""}</h2>{chartGroup ? <button className={styles.resultReset} type="button" onClick={clearCategoryChart}>Visa totalt</button> : null}</div>
          <p className={styles.resultChartScope} role="status">{chartGroup ? `Diagrammet visar endast ${chartGroup.label}. Korten och tabellens total gäller fortfarande alla valda grupper.` : "Diagrammet visar totalt för valda grupper. Klicka på en kategori i tabellen för att visa dess diagram."}</p>
          <p className={styles.chartExplanation}>Intäkter minus kostnader, summerat från årets början. Heldragen lila visar bokfört resultat; streckad lila visar prognosen.</p>
          <div className={styles.periodizationLegend}><span><i className={styles.resultActualSwatch} /> Faktiskt resultat – heldragen lila</span><span><i className={styles.resultForecastSwatch} /> Prognos – streckad lila</span>{!noReference ? <span><i className={styles.resultReferenceSwatch} /> {chartReferenceLabel} – långstreckad blå</span> : null}</div>
          <ResultComparisonChart reference={noReference ? [] : referenceCurve} referenceLabel={chartReferenceLabel} referenceYear={isBudget ? year : year - 1} year={year} periodEnd={cutoff} actual={resultForecast.actualPoints} forecast={resultForecast.forecastPoints} shade />
          {resultForecast.projectedResult === null ? <p role="status">Prognos saknas: ladda upp årets och föregående års SIE-underlag.</p> : null}
          <details className={styles.resultExplanation}>
            <summary>Så räknas jämförelsen</summary>
            <p className={styles.chartExplanation}>Ytan mellan bokfört resultat och jämförelselinjen är grön när årets resultat är högre och röd när det är lägre. Skuggningen visas bara för bokfört utfall, inte för prognosen.</p>
            <p className={styles.chartExplanation}>Resultat är intäkter minus kostnader, inte pengar på banken. Grupperingen styr hur kontona summeras och ändrar inte periodiseringen eller totalresultatet. Diagrammet visar alltid hela året med utfall till valt datum och prognos för resten av året när underlag finns. Valet av jämförelseperiod styr korten och tabellen.</p>
            {isBudget ? <p className={styles.chartExplanation}>{compareFullYear ? "Tabellen och korten jämför utfallet med hela årsbudgeten." : "Tabellen och korten jämför utfallet med budget till exakt valt datum. Historiska månadsandelar används, och den pågående månadens budget fördelas jämnt per kalenderdag. Punkten på den blå linjen vid periodslutet visar samma budgetbelopp som kortet och tabellen."} Budgetkurvan visar månadsfördelningen för hela året. Om historik saknas fördelas budgeten jämnt. Lila över blått betyder bättre resultat än planerat.</p> : <p className={styles.chartExplanation}>{compareFullYear ? "Tabellen och korten jämför utfallet med hela föregående år." : "Tabellen och korten jämför utfallet med samma period föregående år."} Den blå linjen visar föregående års resultat med en punkt för samma datum utöver månadssluten.</p>}
            <p className={styles.chartExplanation}>Prognosen tar vid från bokfört resultat till valt datum, dock senast till senaste bokföringsdatum. För resten av månaden och året används föregående års intäkter och kostnader efter samma datum. Prognosen avser resultat, inte bank och kassa.</p>
          </details>

        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><h2>Resultat per {grouping === "report" ? "redovisningsgrupp" : "kategori"}</h2>{chartGroup ? <button type="button" onClick={clearCategoryChart}>Stäng kategori</button> : null}</div>
          {!visible.length ? <p>Inga grupper valda.</p> : null}
          {chartGroup && !noReference ? <p className={styles.chartExplanation}>De tunna staplarna visar varje kontos bidrag till gruppens avvikelse, på samma skala. Gröna och röda bidrag summeras till gruppens totala avvikelse.</p> : null}
          <div className={styles.resultTableScroll}><table className={styles.resultTable}><thead><tr><th scope="col">{grouping === "report" ? "Grupp / konto" : "Kategori / konto"}</th><th scope="col">Utfall</th><th scope="col">{comparisonLabel}</th><th scope="col" aria-label="Avvikelsediagram" /><th scope="col">Avvikelse</th></tr></thead><tbody>
            {visible.map((group) => <Fragment key={group.id}>
              <tr className={`${styles.resultGroup} ${chartGroup?.id === group.id ? styles.resultGroupSelected : ""}`} onClick={(event) => { if (!(event.target as Element).closest("button")) focusCategoryChart(group.id); }}><th scope="row"><button className={styles.accountDetailToggle} type="button" aria-expanded={activeGroupId === group.id} aria-pressed={chartGroup?.id === group.id} onClick={() => focusCategoryChart(group.id)}><span>{group.label}</span><ChevronRight size={16} className={activeGroupId === group.id ? styles.categoryChevronOpen : undefined} /></button></th><td>{currency.format(group.actual)}</td><td>{noReference ? "–" : currency.format(group.comparison)}</td><td className={styles.resultBarCell}>{varianceBar(group.label, group.variance)}</td><td className={tone(group.variance)}>{noReference ? "–" : currency.format(group.variance)}</td></tr>
              {activeGroupId === group.id ? group.accounts.map((account) => {
                const isAccountExpanded = expandedAccount === account.account;
                const transactions = isAccountExpanded ? buildResultAccountTransactions(dataset, account.account, year, cutoff, comparison) : [];
                return <Fragment key={account.account}><tr><th scope="row" className={styles.resultAccount}><button className={styles.accountDetailToggle} type="button" aria-expanded={isAccountExpanded} onClick={() => setExpandedAccount(isAccountExpanded ? null : account.account)}><ChevronRight size={15} aria-hidden="true" className={isAccountExpanded ? styles.categoryChevronOpen : undefined} />{account.account} · {account.name}</button></th><td>{currency.format(account.actual)}</td><td>{noReference ? "–" : currency.format(account.comparison)}</td><td className={`${styles.resultBarCell} ${styles.resultAccountBar}`}>{varianceBar(`${account.account} · ${account.name}`, account.variance)}</td><td className={tone(account.variance)}>{noReference ? "–" : currency.format(account.variance)}</td></tr>
                  {isAccountExpanded ? <tr><td colSpan={5}><div className={styles.transactionDetails}><strong>Transaktioner för {account.account} · {account.name}</strong><p className={styles.chartExplanation}>Här visas bokföringsposterna bakom kontots utfall. Vid jämförelse med föregående år visas även jämförelseperiodens poster. Budgetbelopp bygger på budgetunderlaget och är inte bokförda transaktioner.</p><table><thead><tr><th>Datum</th><th>Verifikation</th><th>Text</th><th>Utfall</th>{!isBudget ? <th>Föregående år</th> : null}</tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td>{isoDate(transaction.date)}</td><td>{transaction.voucher}</td><td>{transaction.text}</td><td>{transaction.actual === null ? "–" : currency.format(transaction.actual)}</td>{!isBudget ? <td>{transaction.comparison === null ? "–" : currency.format(transaction.comparison)}</td> : null}</tr>)}</tbody><tfoot><tr><th scope="row" colSpan={3}>Summa</th><td>{currency.format(account.actual)}</td>{!isBudget ? <td>{currency.format(account.comparison)}</td> : null}</tr></tfoot></table>{!transactions.length ? <p>Inga bokförda transaktioner i vald period.</p> : null}</div></td></tr> : null}
                </Fragment>;
              }) : null}
              {grouping === "report" && group.id === lastGroup(income) ? summaryRow("Summa rörelsens intäkter", income) : null}
              {grouping === "report" && group.id === lastGroup(directCosts) ? summaryRow("Bruttovinst", (code) => income(code) || directCosts(code)) : null}
              {grouping === "report" && group.id === lastGroup(operating) ? summaryRow("Rörelseresultat", operating) : null}
              {grouping === "report" && group.id === lastGroup(financial) ? summaryRow("Resultat efter finansiella poster", financial) : null}
            </Fragment>)}
          </tbody><tfoot><tr><th scope="row">{selection === null ? "Beräknat resultat" : "Resultat för valda grupper"}</th><td>{currency.format(actual)}</td><td>{noReference ? "–" : currency.format(reference)}</td><td className={styles.resultBarCell}>{varianceBar("Resultat", actual - reference)}</td><td className={tone(actual - reference)}>{noReference ? "–" : currency.format(actual - reference)}</td></tr></tfoot></table></div>
        </article>
      </>}
    </section>
  </main>;
}

export default function ResultPage() {
  return <Suspense fallback={<main style={{ padding: 32 }}>Läser rapport…</main>}><ResultPageContent /></Suspense>;
}
