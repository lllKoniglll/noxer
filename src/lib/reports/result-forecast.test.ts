import { describe, expect, it } from "vitest";
import { buildResultForecast } from "./result-forecast";
import { buildResultReport } from "./result";
import type { AccountingDataset, Voucher } from "../sie/types";

const voucher = (date: string, account: string, amount: number): Voucher => ({ date, series: "A", number: date + account, text: "", sourceFile: "test", transactions: [{ account, amount, text: "" }] });
const data: AccountingDataset = {
  organizationName: "Test", files: [], accounts: new Map(), fiscalYears: [], openingBalances: [], closingBalances: [], resultBalances: [],
  vouchers: [voucher("20260101", "3055", -1000), voucher("20261019", "7110", 400), voucher("20251019", "3055", -800), voucher("20251020", "3055", -200), voucher("20251130", "7110", 300), voucher("20251201", "1930", 99999)]
};

describe("resultatprognos", () => {
  it("lägger bara till föregående års transaktioner efter samma datum och exkluderar balanskonton", () => {
    const forecast = buildResultForecast(data, 2026);
    expect(forecast.actualPoints.at(-1)?.amount).toBe(600);
    expect(forecast.forecastPoints[0]).toEqual(forecast.actualPoints.at(-1));
    expect(forecast.forecastPoints[0].month).toBeCloseTo(9 + 19 / 31);
    expect(forecast.forecastPoints.find((point) => point.month === 10)?.amount).toBe(800);
    expect(forecast.projectedResult).toBe(500);
  });
  it("följer valda konton, även konton som bara har aktivitet i prognosen", () => {
    expect(buildResultForecast(data, 2026, undefined, ["3055"]).projectedResult).toBe(1200);
    const extra = { ...data, vouchers: [...data.vouchers, voucher("20251215", "7830", 50)] };
    const groups = buildResultReport(extra, undefined, 2026, "20261019", "budget");
    expect(groups.find((group) => group.id === "depreciation")?.accounts[0].account).toBe("7830");
    expect(buildResultForecast(extra, 2026, undefined, ["7830"]).projectedResult).toBe(-50);
    expect(buildResultForecast(data, 2026, undefined, []).projectedResult).toBe(0);
  });
  it("visar inte en påhittad prognos utan historik", () => {
    const forecast = buildResultForecast({ ...data, vouchers: data.vouchers.filter((entry) => entry.date.startsWith("2026")) }, 2026);
    expect(forecast.projectedResult).toBeNull();
    expect(forecast.forecastPoints).toEqual([]);
  });
  it("begränsar prognosstarten till senaste bokföringsdatum och undviker dubbelräkning vid månadsslut", () => {
    expect(buildResultForecast(data, 2026, "20261231").cutoff).toBe("20261019");
    const forecast = buildResultForecast(data, 2026, "20260131");
    expect(forecast.forecastPoints.filter((point) => point.month === 1)).toHaveLength(1);
    expect(forecast.projectedResult).toBe(1700);
  });
  it("vid årets slut är prognosen lika med det bokförda resultatet", () => {
    const forecast = buildResultForecast({ ...data, vouchers: [voucher("20261231", "3055", -1000)] }, 2026);
    expect(forecast.projectedResult).toBe(1000);
    expect(forecast.forecastPoints).toEqual([]);
  });
});
