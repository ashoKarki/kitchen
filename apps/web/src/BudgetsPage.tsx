import { useState, type FormEvent } from "react";
import {
  budgetScopeLabel,
  createBudget,
  deleteBudget,
  expenseCategories,
  filterReceiptsByPeriod,
  formatCents,
  getBudgetSpendCents,
  markBudgetAlertRead,
  parseEuroCents,
  updateBudget,
  type Budget,
  type BudgetDraft,
  type BudgetScope,
  type ExpenseCategory
} from "@my-kitchen/shared";
import { getDatabase } from "./firebase";
import { useReceipts, useSettings } from "./hooks";
import { useBudgetAlerts, useBudgets } from "./useBudgetData";
import { useToast } from "./toast";

type ScopeType = BudgetScope["type"];

function scopeFromForm(type: ScopeType, categories: ExpenseCategory[]): BudgetScope {
  return type === "categories" ? { type, categories } : { type };
}

export default function BudgetsPage() {
  const { showToast } = useToast();
  const budgets = useBudgets();
  const alerts = useBudgetAlerts();
  const receipts = useReceipts();
  const settings = useSettings();
  const [editing, setEditing] = useState<{ id: string; budget: Budget } | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [name, setName] = useState("");
  const [period, setPeriod] = useState<BudgetDraft["period"]>("monthly");
  const [amountEuros, setAmountEuros] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType>("overall");
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allLoading = budgets.loading || alerts.loading || receipts.loading || settings.loading;
  const loadError = budgets.error ?? alerts.error ?? receipts.error ?? settings.error;
  const timeZone = settings.data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const discretionaryCategories = settings.data?.discretionaryCategories ?? [];
  const now = new Date();
  const parsedAmountCents = parseEuroCents(amountEuros);

  function openEditor(entry?: { id: string; budget: Budget }) {
    setEditing(entry ?? null);
    setName(entry?.budget.name ?? "");
    setPeriod(entry?.budget.period ?? "monthly");
    setAmountEuros(entry ? (entry.budget.amountCents / 100).toFixed(2) : "");
    setScopeType(entry?.budget.scope.type ?? "overall");
    setCategories(entry?.budget.scope.type === "categories" ? [...entry.budget.scope.categories] : []);
    setError(null);
    setNotice(null);
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setEditing(null);
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a budget name.");
      return;
    }
    if (parsedAmountCents === null || parsedAmountCents <= 0) {
      setError("Enter a positive budget amount in euros.");
      return;
    }
    if (scopeType === "categories" && categories.length === 0) {
      setError("Choose at least one category.");
      return;
    }
    const draft: BudgetDraft = {
      name: name.trim(),
      period,
      amountCents: parsedAmountCents,
      scope: scopeFromForm(scopeType, categories),
      active: editing?.budget.active ?? true
    };
    setBusy(true);
    setError(null);
    try {
      if (editing) await updateBudget(getDatabase(), editing.id, draft);
      else await createBudget(getDatabase(), draft);
      closeEditor();
      setNotice(editing ? "Budget updated." : "Budget created.");
      showToast(editing ? "Budget updated." : "New budget added.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(id: string, budget: Budget) {
    try {
      await updateBudget(getDatabase(), id, { ...budget, active: !budget.active });
      setError(null);
      showToast(budget.active ? "Budget paused." : "Budget activated.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  async function removeBudget(id: string, budgetName: string) {
    if (!window.confirm(`Delete the "${budgetName}" budget? Existing alerts will be kept.`)) return;
    try {
      await deleteBudget(getDatabase(), id);
      showToast("Budget deleted.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  async function toggleRead(id: string, read: boolean) {
    try {
      await markBudgetAlertRead(getDatabase(), id, !read);
      showToast(read ? "Budget alert marked unread." : "Budget alert marked read.", "info");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  if (allLoading) return <p className="message" role="status">Loading budgets…</p>;
  if (loadError) return <p className="error" role="alert">Could not load budgets: {loadError}</p>;

  return <section className="page">
    <div className="page-heading">
      <div><p className="eyebrow">PLAN YOUR SPENDING</p><h1>Budgets</h1><p className="muted">Track weekly or monthly spending and receive alerts at 80% and 100%.</p></div>
      <button className="button primary" onClick={() => openEditor()}>＋ Add budget</button>
    </div>
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {settings.data && !settings.data.budgetAlertsEnabled && <p className="warning" role="status">Budget alerts are turned off in Settings. Budgets will still show current spending.</p>}

    {showEditor && <form className="budget-editor" onSubmit={(event) => void saveBudget(event)}>
      <div className="receipt-editor-heading">
        <div><p className="eyebrow">{editing ? "EDIT BUDGET" : "NEW BUDGET"}</p><h2>{editing ? "Update budget" : "Create a budget"}</h2></div>
        <button type="button" className="icon-button" aria-label="Close budget form" onClick={closeEditor}>×</button>
      </div>
      <div className="budget-form-grid">
        <label>Budget name<input maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Amount (€)<input type="number" min="0.01" step="0.01" value={amountEuros} onChange={(event) => setAmountEuros(event.target.value)} /></label>
        <label>Period<select value={period} onChange={(event) => setPeriod(event.target.value as BudgetDraft["period"])}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label>Applies to<select value={scopeType} onChange={(event) => setScopeType(event.target.value as ScopeType)}><option value="overall">All spending</option><option value="categories">Selected categories</option><option value="discretionary">Discretionary categories</option></select></label>
      </div>
      {scopeType === "categories" && <div className="budget-category-options" aria-label="Budget categories">
        {expenseCategories.map((category) => <label key={category}><input type="checkbox" checked={categories.includes(category)} onChange={(event) => setCategories((current) => event.target.checked ? [...current, category] : current.filter((entry) => entry !== category))} />{category}</label>)}
      </div>}
      {scopeType === "discretionary" && <p className="muted">Uses the discretionary categories selected in Settings: {discretionaryCategories.length ? discretionaryCategories.join(", ") : "none selected"}.</p>}
      <div className="receipt-editor-actions">
        <button type="button" className="button secondary" onClick={closeEditor}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create budget"}</button>
      </div>
    </form>}

    <div className="budget-grid">
      {budgets.data?.length === 0 ? <div className="empty"><span className="empty-icon">€</span><h2>No budgets yet</h2><p>Create a budget to track spending for a period or category.</p></div>
        : budgets.data?.map(({ id, budget }) => {
          const currentReceipts = filterReceiptsByPeriod(receipts.data ?? [], now, budget.period, timeZone)
            .map(({ receipt }) => receipt);
          const spentCents = getBudgetSpendCents(currentReceipts, budget.scope, discretionaryCategories);
          const progress = spentCents / budget.amountCents * 100;
          return <article className={`budget-card${budget.active ? "" : " inactive"}`} key={id}>
            <div className="budget-card-heading">
              <div><p className="eyebrow">{budget.period === "weekly" ? "WEEKLY" : "MONTHLY"} BUDGET</p><h2>{budget.name}</h2></div>
              <span className={`budget-status${budget.active ? " active" : ""}`}>{budget.active ? "Active" : "Paused"}</span>
            </div>
            <p className="muted">{budgetScopeLabel(budget.scope)}</p>
            <div className="budget-amount-row"><strong>{formatCents(spentCents)}</strong><span>of {formatCents(budget.amountCents)}</span><b>{Math.round(progress)}%</b></div>
            <div className="budget-progress" role="img" aria-label={`${budget.name}: ${Math.round(progress)} percent used`}><span className={progress >= 100 ? "over" : progress >= 80 ? "near" : ""} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>
            <div className="budget-card-actions">
              <button className="action-button" onClick={() => openEditor({ id, budget })}><span aria-hidden="true">✎</span> Edit</button>
              <button className="action-button" onClick={() => void toggleActive(id, budget)}><span aria-hidden="true">{budget.active ? "Ⅱ" : "▶"}</span> {budget.active ? "Pause" : "Activate"}</button>
              <button className="action-button destructive-action" onClick={() => void removeBudget(id, budget.name)}><span aria-hidden="true">⌫</span> Delete</button>
            </div>
          </article>;
        })}
    </div>

    <div className="budget-alert-heading"><div><p className="eyebrow">BUDGET ACTIVITY</p><h2>Alerts</h2></div><span className="muted">{alerts.data?.filter(({ alert }) => !alert.read).length ?? 0} unread</span></div>
    {!alerts.data?.length ? <div className="empty"><h2>No budget alerts</h2><p>Alerts appear here when an active budget reaches 80% or 100%.</p></div>
      : <div className="budget-alert-list">
        {[...alerts.data].sort((a, b) => b.alert.createdAt.toMillis() - a.alert.createdAt.toMillis()).map(({ id, alert }) => (
          <article className={`budget-alert${alert.read ? "" : " unread"}`} key={id}>
            <div><strong>{alert.budgetName}: {alert.thresholdPercent}% reached</strong><p>{formatCents(alert.spentCents)} of {formatCents(alert.amountCents)} · {alert.periodKey}</p></div>
            <button className="action-button" onClick={() => void toggleRead(id, alert.read)}><span aria-hidden="true">{alert.read ? "◉" : "✓"}</span> {alert.read ? "Mark unread" : "Mark read"}</button>
          </article>
        ))}
      </div>}
  </section>;
}
