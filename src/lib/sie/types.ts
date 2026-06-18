export type Account = {
  code: string;
  name: string;
};

export type FiscalYear = {
  index: number;
  start: string;
  end: string;
};

export type Balance = {
  yearIndex: number;
  account: string;
  amount: number;
};

export type Transaction = {
  account: string;
  amount: number;
  text: string;
  quantity?: number;
};

export type Voucher = {
  series: string;
  number: string;
  date: string;
  text: string;
  registrationDate?: string;
  transactions: Transaction[];
  sourceFile: string;
};

export type SieFile = {
  fileName: string;
  companyName: string;
  generatedAt?: string;
  fiscalYears: FiscalYear[];
  accounts: Map<string, Account>;
  openingBalances: Balance[];
  closingBalances: Balance[];
  resultBalances: Balance[];
  vouchers: Voucher[];
};

export type MonthlyReportRow = {
  month: string;
  label: string;
  income: number;
  costs: number;
  result: number;
  previousYearResult: number;
};

export type CategorySummary = {
  id: string;
  label: string;
  amount: number;
  previousAmount: number;
};

export type CashPoint = {
  month: string;
  label: string;
  actual: number | null;
  forecast: number | null;
};

export type AccountingDataset = {
  organizationName: string;
  files: string[];
  accounts: Map<string, Account>;
  fiscalYears: FiscalYear[];
  vouchers: Voucher[];
  openingBalances: Balance[];
  closingBalances: Balance[];
  resultBalances: Balance[];
  latestVoucherDate?: string;
};
