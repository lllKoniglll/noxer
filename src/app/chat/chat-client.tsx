"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, Send, UserRound } from "lucide-react";
import { SortableTable, type SortableTableColumn } from "@/app/sortable-table";
import { useUploads } from "@/app/upload-context";
import styles from "../page.module.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

type ChartSpec = {
  title: string;
  plotly: {
    data: unknown[];
    layout: Record<string, unknown>;
    config?: Record<string, unknown>;
  };
};

type TableSpec = {
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

type ChatResponse = {
  answer: string;
  tool_calls: ToolCall[];
  chart?: ChartSpec | null;
  table?: TableSpec | null;
  source: "ollama" | "deterministic";
};

declare global {
  interface Window {
    Plotly?: {
      newPlot: (element: HTMLElement, data: unknown[], layout: Record<string, unknown>, config?: Record<string, unknown>) => void;
      purge: (element: HTMLElement) => void;
    };
  }
}

const API_URL = "/api";

function PlotlyChart({ chart }: { chart: ChartSpec }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!window.Plotly) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>("script[data-plotly]");
          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("Plotly kunde inte laddas")), { once: true });
            return;
          }
          const script = document.createElement("script");
          script.src = "https://cdn.plot.ly/plotly-2.35.2.min.js";
          script.async = true;
          script.dataset.plotly = "true";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Plotly kunde inte laddas"));
          document.head.appendChild(script);
        });
      }

      if (!cancelled && ref.current && window.Plotly) {
        window.Plotly.newPlot(ref.current, chart.plotly.data, { autosize: true, ...chart.plotly.layout }, {
          responsive: true,
          displaylogo: false,
          ...chart.plotly.config
        });
      }
    }

    render();

    return () => {
      cancelled = true;
      if (ref.current && window.Plotly) window.Plotly.purge(ref.current);
    };
  }, [chart]);

  return (
    <section className={styles.chatChart}>
      <h3>{chart.title}</h3>
      <div ref={ref} />
    </section>
  );
}

function isAmountColumn(column: string) {
  const normalized = column.toLowerCase();
  return ["belopp", "amount", "summa", "nuvarande", "foregaende", "föregående", "skillnad", "månadsbelopp"].some((part) =>
    normalized.includes(part)
  );
}

function isCountColumn(column: string) {
  const normalized = column.toLowerCase();
  return ["rader", "antal", "transaktioner"].some((part) => normalized.includes(part));
}

function ResultTable({ table }: { table: TableSpec }) {
  const columns: SortableTableColumn[] = table.columns.map((column) => ({
    key: column,
    label: column,
    format: isAmountColumn(column) ? "thousands" : isCountColumn(column) ? "integer" : "text",
    summable: isAmountColumn(column) || isCountColumn(column)
  }));

  return <SortableTable columns={columns} rows={table.rows} title={table.title} />;
}

export function ChatClient() {
  const { files } = useUploads();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hej! Fråga mig till exempel om största intäkten i april, största utgiften i maj, vilka kategorier som dragit iväg, eller be mig visa ett diagram."
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [chart, setChart] = useState<ChartSpec | null>(null);
  const [table, setTable] = useState<TableSpec | null>(null);
  const [source, setSource] = useState<ChatResponse["source"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: message }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("payload", JSON.stringify({ message, history: messages }));
      files.forEach((file) => formData.append("files", file, file.name));
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) throw new Error(`Backend svarade ${response.status}`);
      const payload = (await response.json()) as ChatResponse;
      setMessages([...nextMessages, { role: "assistant", content: payload.answer }]);
      setToolCalls(payload.tool_calls ?? []);
      setChart(payload.chart ?? null);
      setTable(payload.table ?? null);
      setSource(payload.source ?? "deterministic");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte kontakta agenten");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.chatLayout}>
      <section className={styles.chatPanel}>
        <div className={styles.chatMessages}>
          {messages.map((message, index) => (
            <article className={message.role === "user" ? styles.userMessage : styles.agentMessage} key={`${message.role}-${index}`}>
              <span>{message.role === "user" ? <UserRound size={16} /> : <Bot size={16} />}</span>
              <p>{message.content}</p>
            </article>
          ))}
          {chart ? (
            <article className={styles.agentChartMessage}>
              <span>
                <Bot size={16} />
              </span>
              <PlotlyChart chart={chart} />
            </article>
          ) : null}
          {table ? (
            <article className={styles.agentTableMessage}>
              <span>
                <Bot size={16} />
              </span>
              <ResultTable table={table} />
            </article>
          ) : null}
        </div>

        {loading ? (
          <div className={styles.composerStatus} aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <strong>Ollama analyserar frågan</strong>
              <small>Skapar SQL, kör mot SIE-databasen och bygger svaret...</small>
            </div>
          </div>
        ) : null}

        <form className={styles.chatComposer} onSubmit={submit}>
          <input
            aria-label="Skriv fråga"
            onChange={(event) => setInput(event.target.value)}
            placeholder="Fråga om intäkter, utgifter, kategorier eller diagram..."
            value={input}
          />
          <button disabled={loading || !input.trim()} type="submit">
            <Send size={18} />
            Skicka
          </button>
        </form>
        {error ? <p className={styles.chatError}>{error}</p> : null}
      </section>

      <aside className={styles.toolPanel}>
        <section>
          <h2>Agentverktyg</h2>
          <p>Agenten kan slå upp största intäkt/utgift, kategoriavvikelser, SQL-baserade tabeller och interaktiva Plotly-diagram.</p>
          {source ? (
            <p role="status">Senaste svarskälla: <strong>{source === "ollama" ? "Ollama" : "lokal fallback"}</strong></p>
          ) : null}
        </section>
        {toolCalls.length ? (
          <section className={styles.toolCallList}>
            <h3>Senaste tool-anrop</h3>
            {toolCalls.map((toolCall, index) => (
              <code key={`${toolCall.name}-${index}`}>
                {toolCall.name}({JSON.stringify(toolCall.args)})
              </code>
            ))}
          </section>
        ) : null}
      </aside>
    </div>
  );
}
