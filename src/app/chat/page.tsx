import { BarChart3, Bot, CalendarRange, Landmark, LineChart } from "lucide-react";
import { ChatClient } from "./chat-client";
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
          <a href="/">
            <BarChart3 size={18} aria-hidden="true" />
            Månadsöversikt
          </a>
          <a href="/reports/liquidity">
            <LineChart size={18} aria-hidden="true" />
            Likviditet
          </a>
          <a href="/reports/categories">
            <CalendarRange size={18} aria-hidden="true" />
            Kategorier
          </a>
          <a className={styles.active} href="/chat">
            <Bot size={18} aria-hidden="true" />
            Chat
          </a>
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
