"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Bot, CalendarRange, FileUp, Landmark, LineChart, Plus, Settings2, Trash2, WalletCards } from "lucide-react";
import Link from "next/link";
import { LogoutLink } from "@/app/logout-link";
import { useUploads } from "@/app/upload-context";
import { emptyAccountingDataset, formatThousands, getAccountActivity, loadAccountingDataset } from "@/lib/reports/accounting";
import { getAccountCategory, type AccountCategory } from "@/lib/reports/categories";
import type { AccountingDataset } from "@/lib/sie/types";
import styles from "../page.module.css";

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "ny-kategori";
}

export default function CategoryEditorPage() {
  const { files, categories, saveCategories } = useUploads();
  const [dataset, setDataset] = useState<AccountingDataset>(() => emptyAccountingDataset());
  const [draft, setDraft] = useState<AccountCategory[]>(categories);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dirtyRef.current) setDraft(categories);
  }, [categories]);
  useEffect(() => { void loadAccountingDataset(files).then(setDataset); }, [files]);

  const accountActivity = useMemo(() => getAccountActivity(dataset), [dataset]);
  const accountTotals = useMemo(() => new Map(accountActivity.map((item) => [item.account, item.latestResult])), [accountActivity]);

  function accountsFor(category: AccountCategory) {
    return accountActivity.filter((account) => getAccountCategory(account.account, draft).id === category.id);
  }

  function queueSave(nextDraft: AccountCategory[], includeNameChanges = false) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const savedNames = new Map(categories.map((category) => [category.id, category.label]));
      const categoriesToSave = includeNameChanges
        ? nextDraft
        : nextDraft.map((category) => ({ ...category, label: savedNames.get(category.id) ?? category.label }));
      const nextCategories = normalizedCategories(categoriesToSave);
      setSaving(true);
      void saveCategories(nextCategories).then(() => {
        dirtyRef.current = false;
        setDraft(nextCategories);
        setMessage("Ändringarna sparades automatiskt.");
      }).catch((error) => {
        setMessage(error instanceof Error ? error.message : "Kategorierna kunde inte sparas.");
      }).finally(() => setSaving(false));
    }, 450);
  }

  function updateDraft(nextDraft: AccountCategory[], autoSave = true, includeNameChanges = false) {
    dirtyRef.current = true;
    setDraft(nextDraft);
    setMessage(null);
    if (autoSave) queueSave(nextDraft, includeNameChanges);
  }

  function updateCategory(id: string, update: (category: AccountCategory) => AccountCategory, autoSave = false) {
    updateDraft(draft.map((category) => category.id === id ? update(category) : category), autoSave);
  }

  function addNamedAccount(categoryId: string, account: string) {
    updateDraft(draft.map((category) => category.id === categoryId
      ? { ...category, accounts: category.accounts.includes(account) ? category.accounts : [...category.accounts, account] }
      : { ...category, accounts: category.accounts.filter((value) => value !== account) }), true);
    setAccountSearch("");
  }

  function addCategory() {
    const label = newCategoryName.trim();
    if (!label) return;
    const baseId = slugify(label);
    let id = baseId;
    let suffix = 2;
    while (draft.some((category) => category.id === id)) id = `${baseId}-${suffix++}`;
    updateDraft([...draft, { id, label, accounts: [] }], true, true);
    setExpanded(id);
    setNewCategoryName("");
  }

  function removeCategory(categoryId: string) {
    if (categoryId === "other") return;
    const category = draft.find((item) => item.id === categoryId);
    if (!category) return;
    updateDraft(draft
      .filter((item) => item.id !== categoryId)
      .map((item) => item.id === "other" ? { ...item, accounts: [...item.accounts, ...category.accounts] } : item));
    setExpanded(null);
  }

  function saveCategory() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const nextCategories = normalizedCategories(draft);
    setSaving(true);
    void saveCategories(nextCategories).then(() => {
      dirtyRef.current = false;
      setDraft(nextCategories);
      setMessage("Kategorin sparades.");
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "Kategorin kunde inte sparas.");
    }).finally(() => setSaving(false));
  }

  function normalizedCategories(source: AccountCategory[]): AccountCategory[] {
    const editable = source.filter((category) => category.id !== "other");
    const assignedToEditable = (account: string) => editable.some((category) => category.accounts.some((rule) => account === rule || account.startsWith(rule)));
    const otherAccounts = accountActivity.map((account) => account.account).filter((account) => !assignedToEditable(account));
    return source.map((category) => category.id === "other" ? { ...category, accounts: otherAccounts } : category);
  }

  useEffect(() => {
    if (!accountActivity.length || dirtyRef.current) return;
    const nextCategories = normalizedCategories(categories);
    if (JSON.stringify(nextCategories) !== JSON.stringify(categories)) {
      dirtyRef.current = true;
      setDraft(nextCategories);
      queueSave(nextCategories);
    }
  }, [accountActivity, categories]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

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
          <Link href="/reports/budget"><WalletCards size={18} aria-hidden="true" />Budget</Link>
          <Link href="/chat"><Bot size={18} aria-hidden="true" />Chat</Link>
          <Link href="/files"><FileUp size={18} aria-hidden="true" />Filer</Link>
          <Link className={styles.active} href="/categories"><Settings2 size={18} aria-hidden="true" />Redigera kategorier</Link>
          <LogoutLink />
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><p>{dataset.organizationName}</p><h1>Redigera kategorier</h1><span className={styles.fileStatus}>Kategorierna gäller för alla rapporter i den här workspacen.</span></div>
          <span className={styles.fileStatus}>{saving ? "Sparar ändringar..." : "Konton sparas direkt · namn sparas med Spara kategori"}</span>
        </header>

        {message ? <p className={styles.categoryMessage} role="status">{message}</p> : null}
        <p className={styles.copy}>Kollapsade kategorier visar namn, antal konton och totalen från senaste årets bokföring. Kontoändringar sparas när du klickar. Ändra ett kategorinamn och klicka sedan på Spara kategori.</p>

        <section className={styles.categoryEditorList} aria-label="Kategorier">
          {draft.map((category) => {
            const actualAccounts = accountsFor(category);
            const total = actualAccounts.reduce((sum, account) => sum + (accountTotals.get(account.account) ?? 0), 0);
            const isEditable = category.id !== "other";
            const isExpanded = expanded === category.id;
            const matchingAccounts = accountActivity
              .filter((account) => `${account.account} ${account.name}`.toLowerCase().includes(accountSearch.trim().toLowerCase()))
              .filter((account) => !category.accounts.includes(account.account))
              .slice(0, 12);
            return (
              <article className={styles.categoryEditorCard} key={category.id}>
                <button className={styles.categoryEditorHeader} onClick={() => setExpanded(isExpanded ? null : category.id)} type="button" aria-expanded={isExpanded}>
                  <span><strong>{category.label}</strong><small>{actualAccounts.length} konton · {formatThousands(total)}</small></span>
                  <span>{isExpanded ? "−" : "+"}{!isEditable ? " Automatisk" : ""}</span>
                </button>
                {isExpanded ? <div className={styles.categoryEditorBody}>
                  {isEditable ? <>
                    <div className={styles.categoryNameRow}><label>Namn<input value={category.label} onChange={(event) => updateCategory(category.id, (item) => ({ ...item, label: event.target.value }))} /></label><button className={styles.secondaryButton} disabled={saving || category.label.trim() === (categories.find((saved) => saved.id === category.id)?.label ?? "").trim()} onClick={saveCategory} type="button">{saving ? "Sparar..." : "Spara namn"}</button></div>
                    <div className={styles.categoryAccountRules}><strong>Konton och prefix</strong>{category.accounts.length ? category.accounts.map((account) => { const names = accountActivity.filter((item) => item.account === account || item.account.startsWith(account)).map((item) => item.name).filter(Boolean).filter((name, index, values) => values.indexOf(name) === index); return <span key={account}><strong>{account}</strong>{names.length ? <small>{names.join(", ")}</small> : null}<button aria-label={`Ta bort ${account} från ${category.label}`} onClick={() => updateCategory(category.id, (item) => ({ ...item, accounts: item.accounts.filter((value) => value !== account) }), true)} type="button"><Trash2 size={15} aria-hidden="true" /></button></span>; }) : <small>Inga konton tillagda ännu.</small>}</div>
                    <label>Sök konto för att lägga till<input placeholder="Sök på kontonummer eller namn..." value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} /></label>
                    {accountSearch.trim() ? <div className={styles.accountSearchResults}>{matchingAccounts.length ? matchingAccounts.map((account) => <button key={account.account} onClick={() => addNamedAccount(category.id, account.account)} type="button"><strong>{account.account}</strong><span>{account.name}</span></button>) : <small>Inga konton matchar sökningen.</small>}</div> : null}
                    <button className={styles.dangerButton} onClick={() => removeCategory(category.id)} type="button"><Trash2 size={16} aria-hidden="true" />Ta bort kategori</button>
                  </> : <>
                    <p className={styles.copy}>Övrigt fylls automatiskt med konton som inte matchar någon annan kategori.</p>
                    <div className={styles.categoryAccountRules}><strong>Automatiskt placerade konton</strong>{actualAccounts.length ? actualAccounts.map((account) => <span key={account.account}><strong>{account.account}</strong><small>{account.name}</small></span>) : <small>Inga konton ännu.</small>}</div>
                  </>}
                </div> : null}
              </article>
            );
          })}
        </section>

        <section className={styles.newCategoryPanel}>
          <h2>Skapa ny kategori</h2>
          <div><input placeholder="Till exempel Damlag" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} /><button className={styles.secondaryButton} onClick={addCategory} type="button"><Plus size={16} aria-hidden="true" />Lägg till kategori</button></div>
        </section>
      </section>
    </main>
  );
}
