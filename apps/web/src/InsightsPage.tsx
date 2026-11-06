import { useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  buildSpendingInsightReport,
  formatCents,
  type AiInsightContext
} from "@my-kitchen/shared";
import { getCloudFunctions } from "./firebase";
import { useReceipts, useSettings } from "./hooks";
import { useBudgets } from "./useBudgetData";
import { useToast } from "./toast";

interface GenerateInsightsRequest {
  appKey: string;
  context: AiInsightContext;
}

interface GeneratedInsights {
  summary: string;
  observations: string[];
  suggestions: string[];
}

export default function InsightsPage() {
  const { showToast } = useToast();
  const receipts = useReceipts();
  const budgets = useBudgets();
  const settings = useSettings();
  const [aiInsights, setAiInsights] = useState<GeneratedInsights | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timeZone = settings.data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const report = useMemo(() => buildSpendingInsightReport(
    receipts.data ?? [],
    new Date(),
    timeZone,
    settings.data?.discretionaryCategories ?? [],
    budgets.data ?? []
  ), [budgets.data, receipts.data, settings.data?.discretionaryCategories, timeZone]);
  const loading = receipts.loading || budgets.loading || settings.loading;
  const loadError = receipts.error ?? budgets.error ?? settings.error;
  const appKey = import.meta.env.VITE_APP_KEY;

  async function generateAiInsights() {
    if (!appKey) {
      const message = "AI insights are not configured. Set VITE_APP_KEY and deploy the Functions secrets.";
      setError(message);
      showToast(message, "error");
      return;
    }
    setAiBusy(true);
    setError(null);
    setNotice(null);
    try {
      const generate = httpsCallable<GenerateInsightsRequest, GeneratedInsights>(
        getCloudFunctions(),
        "generateInsights"
      );
      const response = await generate({ appKey, context: report.aiContext });
      setAiInsights(response.data);
      setNotice("AI insight generated from aggregate totals and categories only.");
      showToast("AI insight generated.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      setAiBusy(false);
    }
  }

  if (loading) return <p className="message" role="status">Loading insights…</p>;
  if (loadError) return <p className="error" role="alert">Could not load insights: {loadError}</p>;

  return <section className="page">
    <div className="page-heading">
      <div><p className="eyebrow">UNDERSTAND YOUR SPENDING</p><h1>Insights</h1><p className="muted">A clear, non-judgmental view of your recorded spending.</p></div>
    </div>
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}

    <div className="insight-overview">
      <div className="insight-period-grid">
        <article className="insight-total"><span>{report.report.aggregate.currentPeriod.label}</span><strong>{formatCents(report.report.aggregate.currentPeriod.totalCents)}</strong><small>{report.report.aggregate.currentPeriod.receiptCount} receipts</small></article>
        <article className="insight-total"><span>{report.report.aggregate.previousPeriod.label}</span><strong>{formatCents(report.report.aggregate.previousPeriod.totalCents)}</strong><small>{report.report.aggregate.previousPeriod.receiptCount} receipts</small></article>
      </div>
      <h2>Spending patterns</h2>
      {report.report.messages.length === 0 ? <p className="muted">Add receipts to build a spending history and see observations.</p> : <div className="insight-message-list">
        {report.report.messages.map((message) => <article className={`insight-message ${message.kind}`} key={message.id}>
          <strong>{message.title}</strong><p>{message.detail}</p>
        </article>)}
      </div>}
      {report.report.aggregate.categoryTotals.length > 0 && <div className="insight-categories">
        <h2>Category totals this month</h2>
        {report.report.aggregate.categoryTotals.map(({ category, amountCents }) => <div className="insight-category" key={category}><span>{category}</span><strong>{formatCents(amountCents)}</strong></div>)}
      </div>}
    </div>

    <section className="ai-insight-card">
      <div><p className="eyebrow">OPTIONAL AI SUMMARY</p><h2>Ask for a narrative</h2><p className="muted">Uses aggregate period totals, categories, and budget progress. Receipt images, item names, and store names are not sent.</p></div>
      <button className="button primary" disabled={aiBusy || !appKey} onClick={() => void generateAiInsights()}>{aiBusy ? "Generating…" : "Generate AI insights"}</button>
      {!appKey && <p className="hint">AI insights are unavailable until VITE_APP_KEY and the server-side Anthropic secret are configured.</p>}
      {aiInsights && <div className="ai-insight-result">
        <p>{aiInsights.summary}</p>
        {aiInsights.observations.length > 0 && <><h3>Observations</h3><ul>{aiInsights.observations.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ul></>}
        {aiInsights.suggestions.length > 0 && <><h3>Optional ideas</h3><ul>{aiInsights.suggestions.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ul></>}
      </div>}
    </section>
  </section>;
}
