import { decodePc8 } from "./cp437";
import type { Balance, SieFile, Transaction, Voucher } from "./types";

function tokenize(line: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|\{[^}]*\}|[^\s]+/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    tokens.push(match[1] ?? match[0]);
  }

  return tokens;
}

function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  return Number(value.replace(",", "."));
}

function parseBalance(tokens: string[]): Balance | null {
  if (tokens.length < 4) return null;

  return {
    yearIndex: Number(tokens[1]),
    account: tokens[2],
    amount: parseAmount(tokens[3])
  };
}

function parseTransaction(tokens: string[]): Transaction | null {
  if (tokens.length < 4) return null;

  return {
    account: tokens[1],
    amount: parseAmount(tokens[3]),
    text: tokens[5] && tokens[5] !== "0" ? tokens[5] : ""
  };
}

export function parseSieBuffer(buffer: Uint8Array, fileName: string): SieFile {
  const text = decodePc8(buffer);
  const lines = text.split(/\r?\n/);
  const accounts = new Map();
  const fiscalYears = [];
  const openingBalances: Balance[] = [];
  const closingBalances: Balance[] = [];
  const resultBalances: Balance[] = [];
  const vouchers: Voucher[] = [];

  let companyName = "";
  let generatedAt: string | undefined;
  let currentVoucher: Voucher | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "{" || line === "}") continue;

    const tokens = tokenize(line);
    const tag = tokens[0];

    if (tag === "#FNAMN") {
      companyName = tokens[1] ?? "";
      continue;
    }

    if (tag === "#GEN") {
      generatedAt = tokens[1];
      continue;
    }

    if (tag === "#RAR" && tokens.length >= 4) {
      fiscalYears.push({
        index: Number(tokens[1]),
        start: tokens[2],
        end: tokens[3]
      });
      continue;
    }

    if (tag === "#KONTO" && tokens.length >= 3) {
      accounts.set(tokens[1], {
        code: tokens[1],
        name: tokens[2]
      });
      continue;
    }

    if (tag === "#IB") {
      const balance = parseBalance(tokens);
      if (balance) openingBalances.push(balance);
      continue;
    }

    if (tag === "#UB") {
      const balance = parseBalance(tokens);
      if (balance) closingBalances.push(balance);
      continue;
    }

    if (tag === "#RES") {
      const balance = parseBalance(tokens);
      if (balance) resultBalances.push(balance);
      continue;
    }

    if (tag === "#VER" && tokens.length >= 5) {
      currentVoucher = {
        series: tokens[1],
        number: tokens[2],
        date: tokens[3],
        text: tokens[4] ?? "",
        registrationDate: tokens[5],
        transactions: [],
        sourceFile: fileName
      };
      vouchers.push(currentVoucher);
      continue;
    }

    if (tag === "#TRANS" && currentVoucher) {
      const transaction = parseTransaction(tokens);
      if (transaction) currentVoucher.transactions.push(transaction);
    }
  }

  return {
    fileName,
    companyName,
    generatedAt,
    fiscalYears,
    accounts,
    openingBalances,
    closingBalances,
    resultBalances,
    vouchers
  };
}
