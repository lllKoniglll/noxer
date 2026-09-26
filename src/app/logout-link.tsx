import { LogOut } from "lucide-react";
import styles from "./page.module.css";

export function LogoutLink() {
  return (
    <a className={styles.logout} href="https://auth.fluxweaver.com/flows/-/default/invalidation/">
      <LogOut size={18} aria-hidden="true" />
      Logga ut
    </a>
  );
}
