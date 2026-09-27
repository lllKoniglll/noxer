"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bot, CalendarRange, ChevronRight, FileUp, Landmark, LineChart, Settings2, WalletCards } from "lucide-react";
import Link from "next/link";
import { useUploads } from "@/app/upload-context";
import { LogoutLink } from "@/app/logout-link";
import { parseBudgetBuffer } from "@/lib/budget/parser";
import { buildBudgetAccountSummary, buildBudgetCategorySummary, emptyAccountingDataset, formatThousands, loadAccountingDataset } from "@/lib/reports/accounting";
import { getAccountCategory } from "@/lib/reports/categories";
import type { BudgetDataset, AccountingDataset } from "@/lib/sie/types";
import styles from "../../page.module.css";

function amountClass(value: number): string | undefined {
  if (value > 0) return styles.incomeText;
  if (value < 0) return styles.costText;
  return undefined;
}

function BudgetPage() {
  const { files, categories } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());
  const [budgets, setBudgets] = useState<BudgetDataset[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

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
  const categorySummaries = useMemo(() => budget ? buildBudgetCategorySummary(dataset, budget, categories) : [], [dataset, budget, categories]);
  const accounts = useMemo(() => budget ? buildBudgetAccountSummary(dataset, budget) : [], [dataset, budget]);
  const totals = useMemo(() => accounts.reduce((sum, row) => ({ budget: sum.budget + row.budget, actual: sum.actual + row.actual, variance: sum.variance + row.variance }), { budget: 0, actual: 0, variance: 0 }), [accounts]);
  const maxVariance = Math.max(...categorySummaries.map((category) => Math.abs(category.variance)), Math.abs(totals.variance), 1);

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Rapporter">
        <div className={styles.brand}><Landmark size={26} aria-hidden="true" /><div><strong>Kronängs IF</strong><span>Styrelserapport</span></div></div>
        <nav className={styles.nav}>
          <Link href="/"><BarChart3 size={18} aria-hidden="true" />Översikt</Link>
          <Link href="/reports/monthly"><BarChart3 size={18} aria-hidden="true" />Månadsöversikt</Link>
          <Link href="/reports/liquidity"><LineChart size={18} aria-hidden="true" />Likviditet</Link>
          <Link href="/reports/categories"><CalendarRange size={18} aria-hidden="true" />Kategorier</Link>
          <Link href="/reports/accounts"><BarChart3 size={18} aria-hidden="true" />Kontojämförelse</Link>
          <Link className={styles.active} href="/reports/budget"><WalletCards size={18} aria-hidden="true" />Budget</Link>
          <Link href="/chat"><Bot size={18} aria-hidden="true" />Chat</Link>
          <Link href="/files"><FileUp size={18} aria-hidden="true" />Filer</Link>
          <Link href="/categories"><Settings2 size={18} aria-hidden="true" />Redigera kategorier</Link>
          <LogoutLink />
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><p>{dataset.organizationName}</p><h1>Budget och utfall {budget?.year ?? ""}</h1><span className={styles.fileStatus}>{budget ? `Utfall från SIE4 jämfört med ${budget.fileName}` : "Ladda upp en resultatrapport i .xls-format på sidan Filer"}</span></div>
          {budgets.length > 1 ? <label className={styles.budgetSelect}><span>Budgetfil</span><select value={selectedFile} onChange={(event) => setSelectedFile(event.target.value)}>{budgets.map((entry) => <option key={entry.fileName} value={entry.fileName}>{entry.fileName} ({entry.year})</option>)}</select></label> : null}
        </header>

        {!budget ? <div className={styles.emptyState}><WalletCards size={32} aria-hidden="true" /><h2>Ingen budget uppladdad</h2><p>Ladda upp den tab-separerade resultatrapporten i Excel-format på sidan Filer. Filen ska innehålla en kolumn som heter Budget.</p></div> : (
          <>
            <section className={styles.kpis} aria-label="Budgetnyckeltal">
              <article><span>Budgeterat resultat</span><strong className={amountClass(totals.budget)}>{formatThousands(totals.budget)}</strong><small>Budgeterade intäkter och kostnader</small></article>
              <article><span>Utfall hittills</span><strong className={amountClass(totals.actual)}>{formatThousands(totals.actual)}</strong><small>SIE4-data för {budget.year}</small></article>
              <article><span>Avvikelse mot budget</span><strong className={amountClass(totals.variance)}>{formatThousands(totals.variance)}</strong><small>Positivt resultat är bättre</small></article>
              <article><span>Konton</span><strong>{accounts.length}</strong><small>Konton med budget</small></article>
            </section>

            <article className={styles.panel}>
              <div className={styles.panelHeader}><div><span>Kategorier</span><h2>Avvikelse mot budget</h2></div></div>
              <p className={styles.copy}>Grönt betyder att utfallet är bättre än budgeten. Kostnader är negativa, så en mindre kostnad ger en positiv avvikelse.</p>
              <div className={styles.categoryChangeChart} aria-label="Horisontellt stapeldiagram över avvikelse per kategori">
                {categorySummaries.map((category) => {
                  const isExpanded = expandedCategory === category.id;
                  const categoryAccounts = isExpanded ? accounts.filter((account) => getAccountCategory(account.account, categories).id === category.id) : [];
                  return (
                    <div className={styles.categoryChangeItem} key={category.id}>
                      <button className={styles.categoryChangeRow} data-tooltip={`${category.label}: ${formatThousands(category.variance)}`} onClick={() => setExpandedCategory(isExpanded ? null : category.id)} title={`${category.label}: ${formatThousands(category.variance)}`} type="button" aria-expanded={isExpanded}>
                        <strong className={styles.categoryChangeLabel}><span>{category.label}</span><ChevronRight className={isExpanded ? styles.categoryChevronOpen : undefined} size={16} aria-hidden="true" /></strong>
                        <span className={styles.categoryCurrentValue}>{formatThousands(category.budget)}</span>
                        <div className={styles.categoryChangeTrack}><span className={styles.categoryChangeBaseline} />{category.variance !== 0 ? <span className={category.variance > 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max(Math.abs(category.variance) / maxVariance * 50, 1)}%` }} /> : null}</div>
                        <span className={category.variance > 0 ? styles.betterText : category.variance < 0 ? styles.worseText : styles.neutralText}>{formatThousands(category.variance)}</span>
                      </button>
                      {isExpanded ? <div className={styles.chartCategoryDetails}><strong>Konton i {category.label}</strong><table className={styles.categoryDetailsTable}><thead><tr><th>Konto</th><th>Budget</th><th>Utfall</th><th>Avvikelse</th></tr></thead><tbody>{categoryAccounts.map((account) => <tr key={account.account}><td>{account.account} · {account.name}</td><td className={amountClass(account.budget)}>{formatThousands(account.budget)}</td><td className={amountClass(account.actual)}>{formatThousands(account.actual)}</td><td className={amountClass(account.variance)}>{formatThousands(account.variance)}</td></tr>)}</tbody><tfoot><tr><td>Total</td><td className={amountClass(category.budget)}>{formatThousands(category.budget)}</td><td className={amountClass(category.actual)}>{formatThousands(category.actual)}</td><td className={amountClass(category.variance)}>{formatThousands(category.variance)}</td></tr></tfoot></table></div> : null}
                    </div>
                  );
                })}
                <div className={`${styles.categoryChangeRow} ${styles.categoryChangeTotalRow}`} data-tooltip={`Resultat: ${formatThousands(totals.variance)}`} title={`Resultat: ${formatThousands(totals.variance)}`}><strong>Resultat</strong><span className={styles.categoryCurrentValue}>{formatThousands(totals.budget)}</span><div className={styles.categoryChangeTrack}><span className={styles.categoryChangeBaseline} /><span className={totals.variance >= 0 ? styles.categoryChangePositive : styles.categoryChangeNegative} style={{ width: `${Math.max(Math.abs(totals.variance) / maxVariance * 50, 1)}%` }} /></div><span className={totals.variance >= 0 ? styles.betterText : styles.worseText}>{formatThousands(totals.variance)}</span></div>
              </div>
            </article>
          </>
        )}
      </section>
    </main>
  );
}

export default BudgetPage;
