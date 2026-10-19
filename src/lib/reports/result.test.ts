import { describe, expect, it } from "vitest";
import { buildResultAccountTransactions, buildResultReport, RESULT_GROUPS } from "./result";
import { buildBudgetResultCurve } from "./result-forecast";
import { formatSieDate, periodizedBudgetToDate } from "./accounting";
import { ACCOUNT_CATEGORIES } from "./categories";
import { buildBudgetPeriodization } from "./accounting";
import type { AccountingDataset, BudgetDataset } from "../sie/types";

const dataset: AccountingDataset = {
  organizationName: "Test", files: [], accounts: new Map(), fiscalYears: [], openingBalances: [], closingBalances: [], resultBalances: [],
  vouchers: [
    { date: "20260101", series: "A", number: "1", text: "", sourceFile: "test", transactions: [{ account: "3055", amount: -1000, text: "" }, { account: "1930", amount: 1000, text: "" }] },
    { date: "20261019", series: "A", number: "2", text: "", sourceFile: "test", transactions: [{ account: "7110", amount: 400, text: "" }, { account: "8310", amount: -20, text: "" }] },
    { date: "20261020", series: "A", number: "3", text: "", sourceFile: "test", transactions: [{ account: "3055", amount: -5000, text: "" }] },
    { date: "20251019", series: "A", number: "4", text: "", sourceFile: "test", transactions: [{ account: "3055", amount: -800, text: "" }] },
    { date: "20251020", series: "A", number: "5", text: "", sourceFile: "test", transactions: [{ account: "3055", amount: -200, text: "" }] }
  ]
};
const budget: BudgetDataset = { fileName: "budget.xls", organizationName: "Test", year: 2026, rows: [{ account: "3055", name: "Avgifter", amount: 1200 }, { account: "7110", name: "Lön", amount: -600 }, { account: "7830", name: "Avskrivningar", amount: -50 }] };

describe("resultatrapport", () => {
  it("visar bokföringsdatum med bindestreck och behåller redan formaterade datum", () => {
    expect(formatSieDate("20261019")).toBe("2026-10-19");
    expect(formatSieDate("20260101")).toBe("2026-01-01");
    expect(formatSieDate("2026-10-19")).toBe("2026-10-19");
  });

  it("jämför med budget till exakt valt datum och behåller månadsbudgeten vid byte till årsbudget", () => {
    const categories = [{ id: "fees", label: "Avgifter", accounts: ["305"] }, { id: "other", label: "Övrigt", accounts: [] }];
    const expected = buildBudgetPeriodization(dataset, budget, categories, "history");
    for (const grouping of [ACCOUNT_CATEGORIES, categories, RESULT_GROUPS]) {
      const groups = buildResultReport(dataset, budget, 2026, "20260919", "periodizedBudget", grouping, categories);
      const annual = buildResultReport(dataset, budget, 2026, "20260919", "budget", grouping, categories);
      const exactBudget = expected.months.slice(0, 8).reduce((sum, month) => sum + month.budget, 0) + expected.months[8].budget * 19 / 30;
      expect(groups.reduce((sum, group) => sum + group.comparison, 0)).toBeCloseTo(exactBudget, 8);
      const curve = buildBudgetResultCurve(expected.months.map((month) => month.budget), 2026, "20260919");
      expect(curve.find((point) => point.date === "20260919")?.amount).toBeCloseTo(exactBudget, 8);
      expect(groups.reduce((sum, group) => sum + group.actual, 0)).toBe(1000);
      expect(groups.map((group) => group.accounts.map((row) => row.comparisonMonths))).toEqual(annual.map((group) => group.accounts.map((row) => row.comparisonMonths)));
    }
  });
  it("dagfördelning hanterar första dagen, månadsslut och skottår", () => {
    const monthly = Array(12).fill(310);
    expect(periodizedBudgetToDate(monthly, "20260101")).toBe(10);
    expect(periodizedBudgetToDate(monthly, "20260131")).toBe(310);
    expect(periodizedBudgetToDate(monthly, "20240215")).toBeCloseTo(310 + 310 * 15 / 29, 8);
    expect(periodizedBudgetToDate(monthly, "20260228")).toBe(620);
    const curve = buildBudgetResultCurve(monthly, 2026, "20260228");
    expect(curve.filter((point) => point.month === 2)).toHaveLength(1);
    expect(curve.find((point) => point.date === "20260228")?.amount).toBe(620);
    expect(curve.at(-1)?.amount).toBe(3720);
  });
  it("periodiserad budget för december summerar till hela årsbudgeten", () => {
    const groups = buildResultReport(dataset, budget, 2026, "20261231", "periodizedBudget");
    expect(groups.reduce((sum, group) => sum + group.comparison, 0)).toBeCloseTo(550, 8);
  });
  it("kontots transaktioner stämmer med utfall och jämförelse för alla jämförelseval", () => {
    for (const mode of ["budget", "periodizedBudget", "previousPeriod", "previousYear"] as const) {
      const rows = buildResultAccountTransactions(dataset, "3055", 2026, "20261019", mode);
      expect(rows.reduce((sum, row) => sum + (row.actual ?? 0), 0)).toBe(1000);
      expect(rows.reduce((sum, row) => sum + (row.comparison ?? 0), 0)).toBe(mode === "previousPeriod" ? 800 : mode === "previousYear" ? 1000 : 0);
      expect(rows.some((row) => row.date === "20261020")).toBe(false);
    }
  });
  it("använder budgetsidans historiska månadsfördelning oavsett rapportgruppering", () => {
    const categories = [{ id: "fees", label: "Avgifter", accounts: ["305"] }, { id: "other", label: "Övrigt", accounts: [] }];
    const expected = buildBudgetPeriodization(dataset, budget, categories, "history");
    for (const grouping of [ACCOUNT_CATEGORIES, categories]) {
      const groups = buildResultReport(dataset, budget, 2026, "20261019", "budget", grouping, categories);
      const rows = groups.flatMap((group) => group.accounts);
      for (let month = 0; month < 12; month++) {
        expect(rows.reduce((sum, row) => sum + row.comparisonMonths[month], 0)).toBeCloseTo(expected.months[month].budget, 8);
      }
      expect(rows.find((row) => row.account === "3055")?.comparisonMonths[0]).toBe(0);
      expect(rows.find((row) => row.account === "3055")?.comparisonMonths[9]).toBe(1200);
      expect(rows.reduce((sum, row) => sum + row.comparisonMonths.reduce((a, b) => a + b, 0), 0)).toBeCloseTo(550, 8);
    }
  });
  it("fördelar jämnt när historik saknas och bevarar varje kontos årsbudget", () => {
    const groups = buildResultReport({ ...dataset, vouchers: [] }, budget, 2026, "20261019", "budget");
    for (const row of groups.flatMap((group) => group.accounts)) {
      expect(row.comparisonMonths[0]).toBeCloseTo(row.comparison / 12, 8);
      expect(row.comparisonMonths.reduce((sum, value) => sum + value, 0)).toBeCloseTo(row.comparison, 8);
    }
  });
  it("räknar till valt datum, vänder bokföringstecken och tar inte med balanskonton", () => {
    const groups = buildResultReport(dataset, budget, 2026, "20261019", "budget");
    expect(groups.reduce((sum, group) => sum + group.actual, 0)).toBe(620);
    expect(groups.flatMap((group) => group.accounts).some((row) => row.account === "1930")).toBe(false);
    expect(groups.flatMap((group) => group.accounts).find((row) => row.account === "7110")?.actual).toBe(-400);
  });
  it("tar med budgetkonton utan utfall och jämför med hela årsbudgeten", () => {
    const groups = buildResultReport(dataset, budget, 2026, "20260131", "budget");
    expect(groups.reduce((sum, group) => sum + group.comparison, 0)).toBe(550);
    expect(groups.flatMap((group) => group.accounts).some((row) => row.account === "7830")).toBe(true);
  });
  it("jämför samma datum föregående år eller hela föregående år", () => {
    const samePeriod = buildResultReport(dataset, undefined, 2026, "20261019", "previousPeriod");
    const fullYear = buildResultReport(dataset, undefined, 2026, "20261019", "previousYear");
    expect(samePeriod.reduce((sum, group) => sum + group.comparison, 0)).toBe(800);
    expect(fullYear.reduce((sum, group) => sum + group.comparison, 0)).toBe(1000);
  });
  it("byte av gruppering ändrar inte totalresultatet", () => {
    const groups = buildResultReport(dataset, budget, 2026, "20261019", "budget", [{ id: "fees", label: "Avgifter", accounts: ["305"] }, { id: "other", label: "Övrigt", accounts: [] }]);
    expect(groups.reduce((sum, group) => sum + group.actual, 0)).toBe(620);
    expect(groups.reduce((sum, group) => sum + group.comparison, 0)).toBe(550);
  });
  it("konton utan egen kategoriregel hamnar i Övrigt utan att tappa belopp", () => {
    const groups = buildResultReport(dataset, budget, 2026, "20261019", "budget", [{ id: "fees", label: "Avgifter", accounts: ["305"] }, { id: "other", label: "Övrigt", accounts: [] }]);
    expect(groups.find((group) => group.id === "other")?.actual).toBe(-380);
    expect(groups.find((group) => group.id === "other")?.comparison).toBe(-650);
  });
});
