import type { BudgetDataset, BudgetRow } from "@/lib/sie/types";

function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value
    .replace(/[\u00a0\s]/g, "")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function yearFromText(value: string): number | undefined {
  const match = value.match(/(20\d{2})/);
  return match ? Number(match[1]) : undefined;
}

function decodeBudgetText(buffer: Uint8Array): string {
  return new TextDecoder("windows-1252").decode(buffer).replace(/^\uFEFF/, "");
}

export function isBudgetFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".xls");
}

export function parseBudgetBuffer(buffer: Uint8Array, fileName: string): BudgetDataset {
  if (!isBudgetFile(fileName)) throw new Error("Budgeten måste vara en .xls-fil i resultatrapportformatet");

  const lines = decodeBudgetText(buffer).split(/\r?\n/);
  const organizationName = lines[1]?.split("\t")[0]?.trim() || "Okänd förening";
  const year = lines.map(yearFromText).find((candidate) => candidate !== undefined) ?? yearFromText(fileName) ?? new Date().getFullYear();
  const headerIndex = lines.findIndex((line) => line.split("\t").some((cell) => cell.trim().toLowerCase() === "budget"));
  if (headerIndex < 0) throw new Error(`Kunde inte hitta kolumnen Budget i ${fileName}`);

  const budgetColumn = lines[headerIndex].split("\t").findIndex((cell) => cell.trim().toLowerCase() === "budget");
  const rows: BudgetRow[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = line.split("\t");
    const account = cells[0]?.trim() ?? "";
    if (!/^\d{3,6}$/.test(account)) continue;
    const name = cells[1]?.trim() || "Okänt konto";
    const amount = parseAmount(cells[budgetColumn]);
    rows.push({ account, name, amount });
  }

  if (!rows.length) throw new Error(`Kunde inte hitta några konton i ${fileName}`);
  return { fileName, organizationName, year, rows };
}
