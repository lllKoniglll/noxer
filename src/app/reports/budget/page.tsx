import { redirect } from "next/navigation";

export default function BudgetRedirectPage() {
  redirect("/reports/result?comparison=periodizedBudget");
}
