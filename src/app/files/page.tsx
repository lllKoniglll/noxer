"use client";

import { useEffect, useState } from "react";
import { BarChart3, Bot, CalendarRange, FileSpreadsheet, FileUp, Landmark, LineChart, Trash2, WalletCards } from "lucide-react";
import Link from "next/link";
import { useUploads } from "@/app/upload-context";
import { LogoutLink } from "@/app/logout-link";
import { parseBudgetBuffer } from "@/lib/budget/parser";
import { parseSieBuffer } from "@/lib/sie/parser";
import styles from "../page.module.css";

type FileInfo = { file: File; type: "SIE4" | "Budget" | "Okänd"; years: string; detail: string };

function FileManagementPage() {
  const { files, setFiles, removeFile, clearFiles, isLoading, storageError, group } = useUploads();
  const [fileInfo, setFileInfo] = useState<FileInfo[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all(files.map(async (file): Promise<FileInfo> => {
      try {
        if (file.name.toLowerCase().endsWith(".xls")) {
          const budget = parseBudgetBuffer(new Uint8Array(await file.arrayBuffer()), file.name);
          return { file, type: "Budget", years: String(budget.year), detail: `${budget.rows.length} budgetkonton` };
        }
        const sie = parseSieBuffer(new Uint8Array(await file.arrayBuffer()), file.name);
        const years = sie.fiscalYears.map((year) => year.start.slice(0, 4)).join(", ") || "År saknas";
        return { file, type: "SIE4", years, detail: `${sie.vouchers.length} verifikationer` };
      } catch {
        return { file, type: "Okänd", years: "Kunde inte läsa", detail: "Kontrollera filformatet" };
      }
    })).then((result) => { if (active) setFileInfo(result); });
    return () => { active = false; };
  }, [files]);

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
          <Link className={styles.active} href="/files"><FileUp size={18} aria-hidden="true" />Filer</Link>
          <LogoutLink />
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><p>Arbetsyta {group ?? ""}</p><h1>Filer</h1><span className={styles.fileStatus}>Ladda upp, kontrollera och uppdatera underlag för rapporterna</span></div>
          <label className={styles.uploadButton} htmlFor="file-upload"><FileUp size={18} aria-hidden="true" />Ladda upp fil<input id="file-upload" type="file" accept=".se,.sie,.se4,.xls,text/plain,application/octet-stream" multiple onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))} /></label>
        </header>

        <section className={styles.fileIntro}>
          <div><span>Underlag</span><h2>{files.length} {files.length === 1 ? "fil" : "filer"} inlästa</h2><p>SIE4-filer används för utfall. Resultatrapporten i Excel-format används som budget.</p></div>
          {files.length ? <button className={styles.secondaryButton} type="button" onClick={clearFiles}>Radera alla filer</button> : null}
        </section>

        {storageError ? <p className={styles.errorMessage} role="alert">{storageError}</p> : null}
        {isLoading ? <p className={styles.copy}>Läser arbetsytans filer...</p> : null}
        {!isLoading && !files.length ? <div className={styles.emptyState}><FileSpreadsheet size={32} aria-hidden="true" /><h2>Inga filer uppladdade</h2><p>Börja med att ladda upp minst en SIE4-fil. Lägg till en `.xls`-resultatrapport för att kunna följa upp budget.</p></div> : null}

        <div className={styles.fileGrid}>
          {fileInfo.map((entry) => (
            <article className={styles.fileCard} key={entry.file.name}>
              <div className={styles.fileIcon}><FileSpreadsheet size={23} aria-hidden="true" /></div>
              <div className={styles.fileCardBody}><div className={styles.fileCardTitle}><strong>{entry.file.name}</strong><button type="button" aria-label={`Radera ${entry.file.name}`} title={`Radera ${entry.file.name}`} onClick={() => removeFile(entry.file)}><Trash2 size={17} aria-hidden="true" /></button></div><span className={entry.type === "Budget" ? styles.budgetBadge : styles.sieBadge}>{entry.type}</span><dl><div><dt>År</dt><dd>{entry.years}</dd></div><div><dt>Innehåll</dt><dd>{entry.detail}</dd></div><div><dt>Storlek</dt><dd>{Math.max(entry.file.size / 1024, 1).toFixed(0)} kB</dd></div></dl></div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default FileManagementPage;
