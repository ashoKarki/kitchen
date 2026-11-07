import { useState } from "react";
import { Link } from "react-router-dom";
import { formatCents, markBudgetAlertRead } from "@my-kitchen/shared";
import { getDatabase } from "./firebase";
import { useBudgetAlerts } from "./useBudgetData";

export default function NotificationsPage() {
  const alerts = useBudgetAlerts();
  const [error, setError] = useState<string | null>(null);

  async function toggleRead(id: string, read: boolean) {
    try {
      await markBudgetAlertRead(getDatabase(), id, !read);
      setError(null);
    } catch (caught) {
      setError(`Could not update notification: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  }

  return <section className="page narrow">
    <div className="page-heading">
      <div><p className="eyebrow">HOUSEHOLD ACTIVITY</p><h1>Notifications</h1><p className="muted">Budget alerts shared with your household.</p></div>
    </div>
    <p className="muted">Read status is shared with household members.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {alerts.error && <p className="error" role="alert">Could not load notifications: {alerts.error}</p>}
    {alerts.loading && <p className="message" role="status">Loading notifications…</p>}
    {!alerts.loading && !alerts.error && !alerts.data?.length && <div className="empty"><h2>No notifications</h2><p>Budget alerts will appear here when an active budget reaches a warning threshold.</p></div>}
    <div className="budget-alert-list">
      {[...(alerts.data ?? [])].sort((a, b) => b.alert.createdAt.toMillis() - a.alert.createdAt.toMillis()).map(({ id, alert }) => <article className={`budget-alert${alert.read ? "" : " unread"}`} key={id}>
        <div><Link className="notification-destination" to="/budgets" aria-label={`View budget alert for ${alert.budgetName}`}><strong>{alert.budgetName}: {alert.thresholdPercent}% reached</strong><p>{formatCents(alert.spentCents)} of {formatCents(alert.amountCents)} · {alert.periodKey}</p><p>{alert.createdAt.toDate().toLocaleString()}</p><span>View budgets →</span></Link></div>
        <button className="action-button" onClick={() => void toggleRead(id, alert.read)}>{alert.read ? "Mark unread" : "Mark read"}</button>
      </article>)}
    </div>
  </section>;
}
