import { redirect } from "next/navigation";

export default function CategoriesRedirectPage() {
  redirect("/reports/result?comparison=previousPeriod&grouping=categories");
}
