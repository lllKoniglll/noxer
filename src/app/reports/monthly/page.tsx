import { redirect } from "next/navigation";

export default function MonthlyRedirectPage() {
  redirect("/reports/result?comparison=previousPeriod");
}
