import Link from "next/link";
import type { ComparisonMode } from "@/lib/reports/accounting";
import styles from "./page.module.css";

type ComparisonToggleProps = {
  activeMode: ComparisonMode;
  basePath: string;
  cutoffLabel?: string;
};

export function ComparisonToggle({ activeMode, basePath, cutoffLabel }: ComparisonToggleProps) {
  return (
    <div className={styles.comparisonControl} aria-label="Jämförelseperiod">
      <span>Jämför med</span>
      <div>
        <Link
          className={activeMode === "fullYear" ? styles.selectedToggle : undefined}
          href={`${basePath}?comparison=fullYear`}
        >
          Hela föregående år
        </Link>
        <Link
          className={activeMode === "samePeriod" ? styles.selectedToggle : undefined}
          href={`${basePath}?comparison=samePeriod`}
        >
          Samma period
        </Link>
      </div>
      {cutoffLabel ? <small>{cutoffLabel}</small> : null}
    </div>
  );
}
