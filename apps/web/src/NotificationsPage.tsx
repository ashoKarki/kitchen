import { useState } from "react";
import { Link } from "react-router-dom";
import { expiryDescription, formatCents, markBudgetAlertRead } from "@my-kitchen/shared";
import { getDatabase } from "./firebase";
import { useBudgetAlerts } from "./useBudgetData";
import { useToast } from "./toast";
import { useExpiryWarnings } from "./useExpiryWarnings";

export default function NotificationsPage() {
  const alerts = useBudgetAlerts();
  const expiry = useExpiryWarnings();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);

  async function toggleRead(id: string, read: boolean) {
    try {
      await markBudgetAlertRead(getDatabase(), id, !read);
      setError(null);
    } catch (caught) {
      setError(`Could not update notification: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  }

  async function openAlert(id: string, read: boolean) {
    if (read) return;
    try {
      await markBudgetAlertRead(getDatabase(), id);
    } catch (caught) {
      showToast(`Could not mark notification read: ${caught instanceof Error ? caught.message : String(caught)}`, "error");
    }
  }

  return <section className="page narrow">
    <div className="page-heading">
      <div><p className="eyebrow">HOUSEHOLD ACTIVITY</p><h1>Notifications</h1><p className="muted">Expiry warnings and budget alerts for your household.</p></div>
    </div>
    <p className="muted">Budget alert read status is shared with household members.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {alerts.error && <p className="error" role="alert">Could not load notifications: {alerts.error}</p>}
    {expiry.error && <p className="error" role="alert">Could not load expiry warnings: {expiry.error}</p>}
    {(alerts.loading || expiry.loading) && <p className="message" role="status">Loading notifications…</p>}
    {!alerts.loading && !expiry.loading && !alerts.error && !expiry.error && !alerts.data?.length && !expiry.warnings.length && <div className="empty"><h2>No notifications</h2><p>Expiry warnings and budget alerts will appear here.</p></div>}
    <div className="budget-alert-list">
      {expiry.warnings.map(({ id, item }) => <article className="budget-alert unread" key={`expiry-${id}`}>
        <Link className="notification-destination" to="/" aria-label={`View expiry warning for ${item.name}`}>
          <strong>{item.name}: {expiryDescription(item.expiryDate, expiry.now)}</strong>
          <p>Expiry date: {item.expiryDate}</p><span>View pantry →</span>
        </Link>
      </article>)}
      {[...(alerts.data ?? [])].sort((a, b) => b.alert.createdAt.toMillis() - a.alert.createdAt.toMillis()).map(({ id, alert }) => <article className={`budget-alert${alert.read ? "" : " unread"}`} key={id}>
        <div><Link className="notification-destination" to="/budgets" onClick={() => void openAlert(id, alert.read)} aria-label={`View budget alert for ${alert.budgetName}`}><strong>{alert.budgetName}: {alert.thresholdPercent}% reached</strong><p>{formatCents(alert.spentCents)} of {formatCents(alert.amountCents)} · {alert.periodKey}</p><p>{alert.createdAt.toDate().toLocaleString()}</p><span>View budgets →</span></Link></div>
        <button className="action-button" onClick={() => void toggleRead(id, alert.read)}>{alert.read ? "Mark unread" : "Mark read"}</button>
      </article>)}
    </div>
  </section>;
}
