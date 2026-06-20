"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

export type SortableTableColumn = {
  key: string;
  label: string;
  format?: "integer" | "thousands" | "text";
  summable?: boolean;
  tone?: "income" | "cost" | "result" | "neutral";
};

type SortableTableProps = {
  title?: string;
  columns: SortableTableColumn[];
  rows: Record<string, unknown>[];
  filterPlaceholder?: string;
  wide?: boolean;
};

function isNumeric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isAmountColumn(column: SortableTableColumn) {
  if (column.format === "thousands") return true;
  const normalized = `${column.key} ${column.label}`.toLowerCase();
  return ["belopp", "amount", "summa", "saldo", "nuvarande", "foregaende", "föregående", "skillnad", "resultat"].some((part) =>
    normalized.includes(part)
  );
}

function isSummableColumn(column: SortableTableColumn) {
  if (column.summable !== undefined) return column.summable;
  const normalized = `${column.key} ${column.label}`.toLowerCase();
  if (["månad", "manad", "month", "år", "ar", "year", "datum", "date", "konto"].includes(normalized)) return false;
  return isAmountColumn(column) || ["rader", "antal", "transaktioner"].some((part) => normalized.includes(part));
}

function formatCell(value: unknown, column: SortableTableColumn) {
  if (isNumeric(value)) {
    if (column.format === "thousands") {
      return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(value / 1000)} tkr`;
    }
    return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: column.format === "integer" ? 0 : 2 }).format(value);
  }
  if (value === null || value === undefined) return "";
  return String(value);
}

function inferTone(column: SortableTableColumn, row: Record<string, unknown>, title?: string) {
  const value = row[column.key];
  if (column.tone === "income") return styles.incomeText;
  if (column.tone === "cost") return styles.costText;
  if (column.tone === "result" && isNumeric(value)) return value >= 0 ? styles.incomeText : styles.costText;
  if (column.tone === "neutral") return undefined;

  const rowType = String(row.Typ ?? row.typ ?? row.type ?? "").toLowerCase();
  const titleText = String(title ?? "").toLowerCase();
  const label = column.label.toLowerCase();
  if (rowType.includes("intäkt") || rowType.includes("intakt") || titleText.includes("intäkt") || titleText.includes("intakt")) {
    return isAmountColumn(column) ? styles.incomeText : undefined;
  }
  if (rowType.includes("kostnad") || titleText.includes("kostnad") || titleText.includes("utgift")) {
    return isAmountColumn(column) ? styles.costText : undefined;
  }
  if (label.includes("intäkt") || label.includes("intakt")) return styles.incomeText;
  if (label.includes("kostnad") || label.includes("utgift")) return styles.costText;
  return undefined;
}

export function SortableTable({ title, columns, rows, filterPlaceholder = "Filtrera tabellen...", wide = false }: SortableTableProps) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" } | null>(null);

  const visibleRows = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();
    const filtered = normalizedFilter
      ? rows.filter((row) => columns.some((column) => String(row[column.key] ?? "").toLowerCase().includes(normalizedFilter)))
      : rows;

    if (!sort) return filtered;
    return [...filtered].sort((left, right) => {
      const leftValue = left[sort.column];
      const rightValue = right[sort.column];
      const comparison =
        isNumeric(leftValue) && isNumeric(rightValue)
          ? leftValue - rightValue
          : String(leftValue ?? "").localeCompare(String(rightValue ?? ""), "sv");
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [columns, filter, rows, sort]);

  const totals = useMemo(() => {
    const next: Record<string, number> = {};
    for (const column of columns) {
      if (!isSummableColumn(column)) continue;
      if (!visibleRows.some((row) => isNumeric(row[column.key]))) continue;
      next[column.key] = visibleRows.reduce((sum, row) => {
        const value = row[column.key];
        return sum + (isNumeric(value) ? value : 0);
      }, 0);
    }
    return next;
  }, [columns, visibleRows]);

  function toggleSort(column: string) {
    setSort((current) => {
      if (!current || current.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  }

  return (
    <section className={`${styles.chatTable} ${wide ? styles.wideTable : ""}`}>
      <div className={styles.tableHeader}>
        {title ? <h3>{title}</h3> : <span />}
        <input aria-label={`Filtrera ${title ?? "tabell"}`} onChange={(event) => setFilter(event.target.value)} placeholder={filterPlaceholder} value={filter} />
      </div>
      <div className={styles.tableScroll}>
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>
                  <button onClick={() => toggleSort(column.key)} type="button">
                    {column.label}
                    {sort?.column === column.key ? <span>{sort.direction === "asc" ? "↑" : "↓"}</span> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td className={inferTone(column, row, title)} key={column.key}>
                    {formatCell(row[column.key], column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              {columns.map((column, index) => (
                <td className={isAmountColumn(column) ? styles.totalAmount : undefined} key={column.key}>
                  {index === 0 ? "Summa" : totals[column.key] !== undefined ? formatCell(totals[column.key], column) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
