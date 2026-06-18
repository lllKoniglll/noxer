export type AccountCategory = {
  id: string;
  label: string;
  accounts: string[];
};

export const ACCOUNT_CATEGORIES: AccountCategory[] = [
  {
    id: "fees",
    label: "Medlems- och träningsavgifter",
    accounts: ["301", "305", "361"]
  },
  {
    id: "grants",
    label: "Bidrag och sponsring",
    accounts: ["321", "371", "372", "3812"]
  },
  {
    id: "sales",
    label: "Kiosk, café och försäljning",
    accounts: ["331", "332", "333", "351", "3814", "451"]
  },
  {
    id: "events",
    label: "Cuper och arrangemang",
    accounts: ["3811", "3815", "4055", "415", "431", "432", "481"]
  },
  {
    id: "facilities",
    label: "Planer, lokal och arena",
    accounts: ["4058", "501", "507", "582"]
  },
  {
    id: "football",
    label: "Domare, licenser och tävling",
    accounts: ["4053", "4063", "4068"]
  },
  {
    id: "people",
    label: "Personal och arvoden",
    accounts: ["641", "700", "701", "711", "741", "751", "753"]
  },
  {
    id: "admin",
    label: "Administration, IT och bank",
    accounts: ["611", "621", "623", "653", "657", "831"]
  },
  {
    id: "other",
    label: "Övrigt",
    accounts: []
  }
];

export function getAccountCategory(account: string): AccountCategory {
  return (
    ACCOUNT_CATEGORIES.find((category) =>
      category.accounts.some((prefix) => account.startsWith(prefix))
    ) ?? ACCOUNT_CATEGORIES[ACCOUNT_CATEGORIES.length - 1]
  );
}
