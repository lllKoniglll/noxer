import { BarChart3, Bot, FileUp, Landmark, LineChart, Settings2 } from "lucide-react";
import Link from "next/link";
import { ChatClient } from "./chat-client";
import { LogoutLink } from "@/app/logout-link";
import styles from "../page.module.css";

export default function ChatPage() {
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
          <Link href="/reports/result"><BarChart3 size={18} aria-hidden="true" />Resultatrapport</Link>
          <Link href="/reports/liquidity">
            <LineChart size={18} aria-hidden="true" />
            Likviditet
          </Link>
          <Link href="/reports/accounts">
            <BarChart3 size={18} aria-hidden="true" />
            Kontojämförelse
          </Link>
          <Link className={styles.active} href="/chat">
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
            <p>Kronängs Idrottsförening</p>
            <h1>Ekonomichatt</h1>
            <span className={styles.fileStatus}>Python-backend med agentverktyg för SIE4-analys</span>
          </div>
        </header>
        <ChatClient />
      </section>
    </main>
  );
}
