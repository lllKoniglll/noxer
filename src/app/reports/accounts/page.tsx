"use client";

import { Suspense, useEffect, useState } from "react";
import { BarChart3, Bot, CalendarRange, FileUp, Landmark, LineChart, WalletCards } from "lucide-react";
import { SortableTable } from "@/app/sortable-table";
import { getAccountCategory, ACCOUNT_CATEGORIES } from "@/lib/reports/categories";
import {
  buildAccountCategoryComparison,
  buildAccountComparison,
  buildAccountTransactions,
  emptyAccountingDataset,
  formatThousands,
  getAccountActivity,
  getAvailableYears,
  loadAccountingDataset
} from "@/lib/reports/accounting";
import { useUploads } from "@/app/upload-context";
import type { AccountingDataset } from "@/lib/sie/types";
import styles from "../../page.module.css";

function AccountComparisonPageContent() {
  const { files } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState("");

  useEffect(() => {
    loadAccountingDataset(files).then((nextDataset) => {
      setDataset(nextDataset);
      const accounts = getAccountActivity(nextDataset).map((item) => item.account);
      setSelectedAccounts((current) => current.filter((account) => accounts.includes(account)).length ? current.filter((account) => accounts.includes(account)) : accounts.slice(0, 1));
    });
  }, [files]);

  const accountOptions = getAccountActivity(dataset);
  const categoryOptions = ACCOUNT_CATEGORIES.map((category) => ({
    ...category,
    accounts: accountOptions.filter((item) => getAccountCategory(item.account).id === category.id)
  })).filter((category) => category.accounts.length > 0);
  const normalizedAccountFilter = accountFilter.trim().toLowerCase();
  const visibleAccountOptions = normalizedAccountFilter
    ? accountOptions.filter((item) => `${item.account} ${item.name}`.toLowerCase().includes(normalizedAccountFilter))
    : accountOptions;
  const years = getAvailableYears(dataset);
  const monthlyComparison = buildAccountComparison(dataset, selectedAccounts);
  const categoryComparison = buildAccountCategoryComparison(dataset, selectedAccounts);
  const transactionRows = buildAccountTransactions(dataset, selectedAccounts);
  const maxBar = Math.max(...monthlyComparison.flatMap((row) => Object.values(row.years).map((value) => Math.abs(value))), 1);
  const selectedAccountLabel = selectedAccounts.length === 1 ? selectedAccounts[0] : `${selectedAccounts.length} konton`;

  function toggleAccount(account: string) {
    setSelectedAccounts((current) => current.includes(account) ? current.filter((item) => item !== account) : [...current, account]);
  }

  function toggleCategory(categoryAccounts: string[]) {
    setSelectedAccounts((current) => {
      const allSelected = categoryAccounts.every((account) => current.includes(account));
      if (allSelected) return current.filter((account) => !categoryAccounts.includes(account));
      return Array.from(new Set([...current, ...categoryAccounts]));
    });
  }

  if (!files.length) {
    return <main style={{ padding: 32 }}><h1>Ladda upp en SIE4-fil för att börja</h1><p>Uppladdade filer sparas lokalt i den här webbläsaren.</p></main>;
  }

  const yearColumns = years.map((year) => ({ key: String(year), label: String(year), format: "thousands" as const, tone: "result" as const }));

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Rapporter">
        <div className={styles.brand}>
          <Landmark size={26} aria-hidden="true" />
          <div><strong>Kronängs IF</strong><span>Styrelserapport</span></div>
        </div>
        <nav className={styles.nav}>
          <a href="/"><BarChart3 size={18} aria-hidden="true" />Översikt</a>
          <a href="/reports/monthly"><BarChart3 size={18} aria-hidden="true" />Månadsöversikt</a>
          <a href="/reports/liquidity"><LineChart size={18} aria-hidden="true" />Likviditet</a>
          <a href="/reports/categories"><CalendarRange size={18} aria-hidden="true" />Kategorier</a>
          <a className={styles.active} href="/reports/accounts"><BarChart3 size={18} aria-hidden="true" />Kontojämförelse</a>
          <a href="/reports/budget"><WalletCards size={18} aria-hidden="true" />Budget</a>
          <a href="/chat"><Bot size={18} aria-hidden="true" />Chat</a>
          <a href="/files"><FileUp size={18} aria-hidden="true" />Filer</a>
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>{dataset.organizationName}</p>
            <h1>Kontojämförelse</h1>
            <span className={styles.fileStatus}>Jämför valda konton per månad och år</span>
          </div>
          <div className={styles.actions}>
          </div>
        </header>

        <section className={styles.accountFilters} aria-label="Urval för kontojämförelse">
          <div>
            <span className={styles.filterLabel}>Konton</span>
            <strong>{selectedAccounts.length ? selectedAccountLabel : "Välj minst ett konto"}</strong>
            <small>Markera ett eller flera konton som ska summeras.</small>
          </div>
          <div className={styles.accountSelector}>
            <span className={styles.filterLabel}>Kategorier</span>
            <div className={styles.categoryChoices}>
              {categoryOptions.map((category) => {
                const categoryAccounts = category.accounts.map((item) => item.account);
                const allSelected = categoryAccounts.every((account) => selectedAccounts.includes(account));
                return (
                  <label className={allSelected ? styles.categoryChoiceSelected : styles.categoryChoice} key={category.id}>
                    <input checked={allSelected} onChange={() => toggleCategory(categoryAccounts)} type="checkbox" />
                    <span><strong>{category.label}</strong><small>{categoryAccounts.length} konton</small></span>
                  </label>
                );
              })}
            </div>
            <span className={styles.filterLabel}>Konton</span>
            <input
              aria-label="Filtrera konton"
              className={styles.accountSearch}
              onChange={(event) => setAccountFilter(event.target.value)}
              placeholder="Sök kontonummer eller namn..."
              type="search"
              value={accountFilter}
            />
            <small className={styles.accountSelectorMeta}>Senaste årets resultat · visar {visibleAccountOptions.length} av {accountOptions.length} konton</small>
            <div className={styles.accountChoices}>
            {visibleAccountOptions.map((item) => (
              <label key={item.account} className={selectedAccounts.includes(item.account) ? styles.accountChoiceSelected : styles.accountChoice}>
                <input checked={selectedAccounts.includes(item.account)} onChange={() => toggleAccount(item.account)} type="checkbox" />
                <span><strong>{item.account}</strong><small>{item.name}</small></span>
                <em className={item.latestResult > 0 ? styles.accountPositive : styles.accountNegative}>{formatThousands(item.latestResult)}</em>
              </label>
            ))}
            </div>
          </div>
        </section>

        {!selectedAccounts.length ? (
          <article className={styles.panel}><p className={styles.copy}>Välj minst ett konto för att visa jämförelsen.</p></article>
        ) : (
          <>
            <article className={styles.panel}>
              <div className={styles.panelHeader}><div><span>Månadsvis utveckling</span><h2>Valda konton summerade per månad</h2></div></div>
              <div className={styles.legend} aria-label="Diagramförklaring">
                {years.map((year, index) => <span key={year}><i className={styles.accountYearDot} style={{ background: `hsl(${156 + index * 42} 48% 42%)` }} />{year}</span>)}
              </div>
              <div className={styles.accountChart} style={{ gridTemplateColumns: `repeat(${monthlyComparison.length}, minmax(50px, 1fr))` }} aria-label="Stapeldiagram över valda konton per månad">
                {monthlyComparison.map((row) => (
                  <div className={styles.month} key={row.month}>
                    <div className={styles.accountBars}>
                      {years.map((year, index) => {
                        const value = row.years[String(year)] ?? 0;
                        return <span data-tooltip={`${year}: ${value.toLocaleString("sv-SE")} kr`} key={year} title={`${year}: ${value.toLocaleString("sv-SE")} kr`} style={{ background: `hsl(${156 + index * 42} 48% 42%)`, height: `${value ? Math.max((Math.abs(value) / maxBar) * 100, 2) : 0}%` }} />;
                      })}
                    </div>
                    <strong>{row.label}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}><div><span>Kategorier</span><h2>Total för valda konton per kategori</h2></div></div>
              <SortableTable
                columns={[{ key: "category", label: "Kategori", format: "text", summable: false }, ...yearColumns]}
                rows={categoryComparison.map((row) => ({ category: row.label, ...row.years }))}
                title="Kategorisummering"
                wide
              />
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}><div><span>Transaktioner</span><h2>Alla transaktioner för valda konton</h2></div></div>
              <SortableTable
                columns={[{ key: "account", label: "Konto", format: "text", summable: false }, { key: "date", label: "Datum", format: "text", summable: false }, { key: "text", label: "Text", format: "text", summable: false }, ...yearColumns]}
                rows={transactionRows.map((row) => ({ account: `${row.account} · ${row.accountName}`, date: row.date, text: `${row.voucher} · ${row.text}`, ...row.years }))}
                title="Transaktionsdata för alla år"
                filterPlaceholder="Filtrera konto eller transaktion..."
                wide
              />
            </article>
          </>
        )}
      </section>
    </main>
  );
}

export default function AccountComparisonPage() {
  return <Suspense fallback={<main style={{ padding: 32 }}>Laddar rapport...</main>}><AccountComparisonPageContent /></Suspense>;
}
