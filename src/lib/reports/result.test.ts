import { describe, expect, it } from "vitest";
import { buildResultReport, RESULT_GROUPS } from "./result";
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
  it("använder budgetsidans historiska månadsfördelning oavsett rapportgruppering", () => {
    const categories = [{ id: "fees", label: "Avgifter", accounts: ["305"] }, { id: "other", label: "Övrigt", accounts: [] }];
    const expected = buildBudgetPeriodization(dataset, budget, categories, "history");
    for (const grouping of [RESULT_GROUPS, categories]) {
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
    expect(groups.find((group) => group.id === "staff")?.actual).toBe(-400);
  });
  it("tar med budgetkonton utan utfall och jämför med hela årsbudgeten", () => {
    const groups = buildResultReport(dataset, budget, 2026, "20260131", "budget");
    expect(groups.reduce((sum, group) => sum + group.comparison, 0)).toBe(550);
    expect(groups.find((group) => group.id === "depreciation")?.accounts[0].account).toBe("7830");
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
  it("alla resultatkonton tillhör exakt en redovisningsgrupp", () => {
    for (let code = 3000; code <= 8999; code++) {
      const matching = RESULT_GROUPS.filter((group) => group.accounts.some((prefix) => String(code).startsWith(prefix)));
      expect(matching.length, String(code)).toBe(1);
    }
  });
});
