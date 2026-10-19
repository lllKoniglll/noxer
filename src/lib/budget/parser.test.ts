import { describe, expect, it } from "vitest";
import { parseBudgetBuffer } from "./parser";

describe("budgetexport med blandade radbrytningar", () => {
  it("läser också första kontot efter varje rubrik när exporten använder ensamt CR", () => {
    const text = "\t\tResultatrapport\nTestforening\t\t\t\tUtskrivet 2026-10-19\nPeriod\t2026-01-01 - 2026-12-31\n\t\tPeriod\tAckumulerat\tBudget\nNettoomsattning\r3011\tIntrade\t0\t0\t2 500,00\r\n3055\tAvgifter\t0\t0\t295 000,00\r\rPersonal\r7008\tLon\t0\t0\t-68 000,00\r\nAvskrivningar\r7830\tAvskrivningar\t0\t0\t-5 000,00\r";
    const budget = parseBudgetBuffer(new TextEncoder().encode(text), "budget.xls");
    expect(budget.rows.map((row) => row.account)).toEqual(["3011", "3055", "7008", "7830"]);
    expect(budget.rows.reduce((sum, row) => sum + row.amount, 0)).toBe(224500);
  });
});
