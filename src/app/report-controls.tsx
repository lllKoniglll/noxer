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
        <a
          className={activeMode === "fullYear" ? styles.selectedToggle : undefined}
          href={`${basePath}?comparison=fullYear`}
        >
          Hela föregående år
        </a>
        <a
          className={activeMode === "samePeriod" ? styles.selectedToggle : undefined}
          href={`${basePath}?comparison=samePeriod`}
        >
          Samma period
        </a>
      </div>
      {cutoffLabel ? <small>{cutoffLabel}</small> : null}
    </div>
  );
}
