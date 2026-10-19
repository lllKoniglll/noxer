"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Bot, FileUp, Landmark, LineChart, Settings2 } from "lucide-react";
import { useUploads } from "@/app/upload-context";
import { LogoutLink } from "@/app/logout-link";
import { ResultComparisonChart } from "@/app/result-comparison-chart";
import { buildCashForecast, emptyAccountingDataset, formatSieDate, formatThousands, loadAccountingDataset } from "@/lib/reports/accounting";
import { buildResultReport } from "@/lib/reports/result";
import { buildPreviousYearResultCurve, buildResultForecast } from "@/lib/reports/result-forecast";
import type { AccountingDataset } from "@/lib/sie/types";
import styles from "./page.module.css";

function resultClass(value: number): string | undefined {
  if (value > 0) return styles.incomeText;
  if (value < 0) return styles.costText;
  return undefined;
}

export default function OverviewPage() {
  const { files, categories } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());

  useEffect(() => { void loadAccountingDataset(files).then(setDataset); }, [files]);
  const year = Number(dataset.latestVoucherDate?.slice(0, 4)) || new Date().getFullYear();
  const resultForecast = buildResultForecast(dataset, year);
  const projectedResult = resultForecast.projectedResult;
  const cutoff = resultForecast.cutoff ?? `${year}1231`;
  const previousYearCurve = useMemo(() => {
    if (!resultForecast.hasHistory) return [];
    const accounts = [...new Set(dataset.vouchers.flatMap((voucher) => voucher.transactions.map((transaction) => transaction.account)))];
    return buildPreviousYearResultCurve(dataset, year, cutoff, accounts);
  }, [dataset, year, cutoff, resultForecast.hasHistory]);
  const actualResult = resultForecast.cutoff ? resultForecast.actualPoints.at(-1)?.amount ?? null : null;
  const categorySummaries = useMemo(() => buildResultReport(dataset, undefined, year, cutoff, "previousPeriod", categories, categories)
      .filter((category) => category.comparison !== 0 || category.actual !== 0), [dataset, year, cutoff, categories]);
  const totalVariance = categorySummaries.reduce((sum, category) => sum + category.variance, 0);
  const maxVariance = Math.max(...categorySummaries.map((category) => Math.abs(category.variance)), Math.abs(totalVariance), 1);
  const latestDate = resultForecast.cutoff;
  const cashForecast = buildCashForecast(dataset, year, "latestDate");
  const currentCash = [...cashForecast].reverse().find((point) => point.actual !== null)?.actual ?? null;

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Rapporter">
        <div className={styles.brand}><Landmark size={26} aria-hidden="true" /><div><strong>Kronängs IF</strong><span>Styrelserapport</span></div></div>
        <nav className={styles.nav}>
          <Link className={styles.active} href="/"><BarChart3 size={18} aria-hidden="true" />Översikt</Link>
          <Link href="/reports/result"><BarChart3 size={18} aria-hidden="true" />Resultatrapport</Link>
          <Link href="/reports/liquidity"><LineChart size={18} aria-hidden="true" />Likviditet</Link>
          <Link href="/reports/accounts"><BarChart3 size={18} aria-hidden="true" />Kontojämförelse</Link>
          <Link href="/chat"><Bot size={18} aria-hidden="true" />Chat</Link>
          <Link href="/files"><FileUp size={18} aria-hidden="true" />Filer</Link>
          <Link href="/categories"><Settings2 size={18} aria-hidden="true" />Redigera kategorier</Link>
          <LogoutLink />
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><p>{dataset.organizationName}</p><h1>Ekonomisk översikt {year}</h1><span className={styles.fileStatus}>Pengarna som finns nu, resultatet hittills och utsikten för hela året.</span></div>
          <div className={styles.overviewDate}><span>Senaste bokföringsdatum</span>{latestDate ? <time dateTime={formatSieDate(latestDate)}>{formatSieDate(latestDate)}</time> : <strong>Underlag saknas</strong>}</div>
        </header>

        {!files.length ? <div className={styles.emptyState}><BarChart3 size={32} aria-hidden="true" /><h2>Översikten fylls när du laddar upp underlag</h2><p>Ladda upp SIE4-filer och gärna resultatrapporten med budget på sidan Filer.</p></div> : (
          <>
            <section className={styles.overviewSummary} aria-label="Ekonomin i korthet">
              <article>
                <span className={styles.overviewEyebrow}>Bokfört saldo</span>
                <h2>Bank och kassa</h2>
                <strong>{currentCash === null ? "saknas" : formatThousands(currentCash)}</strong>
                <p>Pengarna på bank- och kassakonton. Det är inte samma sak som årets resultat.</p>
                <Link className={styles.panelLink} href="/reports/liquidity">Se likviditeten →</Link>
              </article>
              <article>
                <span className={styles.overviewEyebrow}>Bokfört hittills</span>
                <h2>Årets resultat</h2>
                <strong className={actualResult === null ? undefined : resultClass(actualResult)}>{actualResult === null ? "saknas" : formatThousands(actualResult)}</strong>
                <p>Intäkter minus kostnader från årets början till senaste bokföringsdatum.</p>
                <Link className={styles.panelLink} href="/reports/result">Se resultatrapporten →</Link>
              </article>
              <article className={styles.overviewForecastCard}>
                <span className={styles.overviewEyebrow}>Beräknat för hela året</span>
                <h2>Prognostiserat resultat</h2>
                <strong className={projectedResult === null ? undefined : resultClass(projectedResult)}>{projectedResult === null ? "saknas" : formatThousands(projectedResult)}</strong>
                <p>Bokfört resultat plus föregående års intäkter och kostnader för resten av året. En uppskattning, inte ett färdigt resultat.</p>
              </article>
            </section>

            <article className={`${styles.panel} ${styles.overviewChart}`} aria-label="Resultat och prognos">
              <div className={styles.panelHeader}><div><span>Från bokfört utfall till helårsprognos</span><h2>Resultat och prognos jämfört med föregående år</h2></div><Link className={styles.panelLink} href="/reports/result?comparison=previousPeriod">Utforska resultatet →</Link></div>
              <p className={styles.chartExplanation}>Kurvan visar intäkter minus kostnader, summerat från årets början — inte saldot på banken. Heldragen linje är bokfört utfall, streckad linje är prognos.</p>
              <div className={styles.periodizationLegend}>
                <span><i className={styles.resultActualSwatch} /> Faktiskt resultat – heldragen lila</span>
                <span><i className={styles.resultForecastSwatch} /> Prognos – streckad lila</span>
                {previousYearCurve.length ? <span><i className={styles.resultReferenceSwatch} /> Föregående år – långstreckad blå</span> : null}
              </div>
              <ResultComparisonChart reference={previousYearCurve} referenceLabel="Föregående år" referenceYear={year - 1} year={year} periodEnd={cutoff} actual={resultForecast.actualPoints} forecast={resultForecast.forecastPoints} shade />
              {previousYearCurve.length ? <p className={styles.chartExplanation}>Den blå kurvan visar föregående års resultat för hela året. Ytan är grön när årets bokförda resultat är högre och röd när det är lägre. Prognosen skuggas inte.</p> : <p className={styles.chartExplanation}>Ladda upp föregående års bokföringsunderlag för att visa jämförelsekurvan.</p>}
              <p className={styles.chartExplanation}>Datumlinjen markerar var bokfört utfall slutar och prognosen tar vid. Prognosen bygger på föregående års intäkter och kostnader för återstoden av året. För pekaren över en punkt eller välj den för att se beloppet.</p>
              {projectedResult === null ? <p role="status">Prognos saknas: ladda upp årets och föregående års SIE-underlag.</p> : null}
            </article>

            <article className={`${styles.panel} ${styles.dashboardBudgetPanel}`}>
              <div className={`${styles.panelHeader} ${styles.dashboardPanelHeader}`}><div><span>Samma period föregående år</span><h2>Hur har kategoriernas resultat förändrats?</h2></div><Link className={styles.panelLink} href="/reports/result?comparison=previousPeriod&grouping=categories">Jämför med föregående år →</Link></div>
              {!resultForecast.hasHistory || !resultForecast.cutoff ? <p className={`${styles.copy} ${styles.dashboardLead}`}>Ladda upp årets och föregående års bokföringsunderlag för att jämföra kategoriernas resultat för samma period.</p> : <>
                <p className={`${styles.copy} ${styles.dashboardLead}`}>Skillnad mot samma period föregående år, till senaste bokföringsdatum. Grönt = bättre resultat · Rött = sämre resultat.</p>
                <div className={styles.budgetVarianceChart} aria-label="Skillnad mot samma period föregående år per kategori">
                  {categorySummaries.map((category) => <div className={styles.budgetVarianceRow} key={category.id}><strong>{category.label}</strong><div className={styles.categoryChangeTrack}><span className={styles.categoryChangeBaseline} /><span className={category.variance >= 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max(Math.abs(category.variance) / maxVariance * 50, 1)}%` }} /></div><span className={category.variance >= 0 ? styles.betterText : styles.worseText}>{formatThousands(category.variance)}</span></div>)}
                  <div className={`${styles.budgetVarianceRow} ${styles.categoryChangeTotalRow}`}><strong>Total resultatskillnad</strong><div className={styles.categoryChangeTrack}><span className={styles.categoryChangeBaseline} /><span className={totalVariance >= 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max(Math.abs(totalVariance) / maxVariance * 50, 1)}%` }} /></div><span className={totalVariance >= 0 ? styles.betterText : styles.worseText}>{formatThousands(totalVariance)}</span></div>
                </div>
              </>}
            </article>
          </>
        )}
      </section>
    </main>
  );
}
