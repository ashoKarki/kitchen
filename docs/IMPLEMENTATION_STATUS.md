# Implementation status audit

Audited on 2026-11-06. "DONE" means the existing code already provides the requested behavior; "PARTIAL" means a related implementation exists but needs material changes; "MISSING" means no implementation was found.

| Feature | Status | Evidence | Planned change |
|---|---|---|---|
| Google-only sign-in and signed-out gates | PARTIAL | `apps/web/src/App.tsx`, `apps/mobile/app/_layout.tsx`, `apps/mobile/src/GoogleSignInScreen.tsx` | Keep Google sign-in; replace hard-coded single-email authorization with household bootstrap and membership. Add redirect fallback and verified-member error states. |
| Household memberships, roles, profiles | MISSING | `packages/shared/src/constants.ts`, `functions/src/auth.ts`, `firestore.rules` | Add server-owned membership metadata at `kitchen/main`, bootstrap, member callables, and member-scoped client UI. |
| Household migration | MISSING | `functions/scripts/seed-emulator.mjs`; current data is at `kitchen/main/**` | Keep current paths; bootstrap metadata without moving data. |
| Member settings and device ownership | MISSING | `packages/shared/src/settingsService.ts`, `apps/mobile/src/push.ts`, `firestore.rules` | Add member settings with legacy setting fallback and associate device registrations with their member. |
| Invites, member management, account deletion | MISSING | `functions/src/index.ts`, `firestore.rules` | Add hashed, expiring, single-use invites and owner/member management callables and screens. |
| App Check on callable functions | MISSING | `functions/src/scanReceipt.ts`, `functions/src/generateInsights.ts` | Add configurable enforcement after client providers are configured. |
| APP_KEY removal | MISSING | `functions/src/scanReceipt.ts`, `functions/src/generateInsights.ts`, both `.env.example` files | Remove client-shipped APP_KEY after membership authorization is in place. |
| Firestore membership rules and regression suite | MISSING | `firestore.rules`; no Rules Unit Testing package or suite in root manifest | Preserve the temporary owner fallback, then add membership validation and emulator rules tests. |
| Bootstrap/deployment checklist | MISSING | No `docs/DEPLOY_CHECKLIST.md` | Document the safe manual rollout sequence and required parameters. |
| Firestore scheduled backups and retention | MISSING | `functions/src/index.ts`, `firebase.json` | Add scheduled export and document bucket lifecycle and IAM setup. |
| JSON export/import | MISSING | No export/import implementation in `functions/src` or application screens | Add owner-authorized export and preview/confirm import. |
| Soft delete, undo, recently deleted | MISSING | `packages/shared/src/itemService.ts`, `packages/shared/src/receiptService.ts`, `packages/shared/src/budgetService.ts` | Add additive deletion metadata, filtered views, undo, restore, purge, and settings UI. |
| AI token/cost usage and soft limits | PARTIAL | `functions/src/scanReceipt.ts`, `functions/src/generateInsights.ts` | Existing per-day request caps do not account for tokens/cost. Extend usage after authorization and provider calls are unified. |
| Sentry, safe scrubbing, error boundaries | MISSING | No Sentry or ErrorBoundary implementation in app entry points or Functions | Add optional DSN-based monitoring with strict PII scrubbing and friendly fallback UI. |
| Offline persistence and connectivity indicator | PARTIAL | `apps/web/src/firebase.ts`, `apps/mobile/src/firebase.ts`; Firestore listeners are used | Explicitly configure durable cache/connectivity and expose pending-write/offline status. |
| Pantry state, shopping checkbox flow | DONE | `packages/shared/src/itemService.ts`, `packages/shared/src/itemViews.ts`, `apps/mobile/src/InventoryScreen.tsx` | Retain behavior while adding ownership metadata and requested item fields. |
| Receipt-to-pantry matching and purchased-item completion | DONE | `packages/shared/src/itemViews.ts`, `packages/shared/src/itemService.ts`, `apps/web/src/ReceiptsPage.tsx`, `apps/mobile/src/ReceiptsScreen.tsx` | Retain behavior; add safe additive attribution/deletion fields. |
| German receipt scan, review, dedupe, total checks | DONE | `functions/src/scanReceipt.ts`, `functions/src/receiptSchema.ts`, both receipt screens | Keep the current review and totals; later extend to multiple images and scan-quality feedback. |
| Manual expense entry | DONE | `apps/web/src/ReceiptsPage.tsx`, `apps/mobile/src/ReceiptsScreen.tsx` | Preserve existing flow while adding attribution and undo. |
| Expense periods, charts, CSV export | DONE | `packages/shared/src/expenseAnalytics.ts`, both receipt screens | Extend totals only as compatible features are implemented. |
| Budget alert ladder (70–100%, then +10%) | DONE | `packages/shared/src/budgetAnalytics.ts`, `functions/src/budgetAlertLogic.ts`, `functions/src/budgetAlerts.ts`, `functions/test/budgetAlertLogic.test.ts` | No further ladder change. Preserve integer-cent comparisons and existing state compatibility. |
| Alert center and read-state handling | DONE | `packages/shared/src/alertService.ts`, `functions/src/budgetAlerts.ts`, `apps/web/src/useBudgetData.ts`, `apps/mobile/src/useBudgetData.ts` | Retain read-only server alerts and member-specific push delivery. |
| Deterministic spending insights | DONE | `packages/shared/src/insights.ts`, both Insights screens | Add food-waste/discount/fixed-cost metrics when their data models exist. |
| AI spending analysis | PARTIAL | `functions/src/generateInsights.ts`, both Insights screens | Remove APP_KEY and single-owner checks, then record tokens/cost and enforce household limits. |
| Expiry dates, use-soon, food waste, shelf-life suggestions | MISSING | `packages/shared/src/types.ts`, `apps/mobile/src/InventoryScreen.tsx` | Add typed domain logic, tests, forms, badges, reminders, and waste metrics. |
| Low-stock thresholds and auto-finish | MISSING | `packages/shared/src/types.ts`, `packages/shared/src/itemService.ts` | Add a tested stock state machine and quantity steppers. |
| Suggested shopping list | MISSING | No suggestion logic or UI found | Add German product keys, interval calculation, daily/receipt updates, and add/dismiss UI. |
| Barcode lookup and scanning | MISSING | No barcode implementation found | Add Open Food Facts lookup/cache callable, web/mobile scanner, and product confirmation flow. |
| Store/aisle grouping and preferences | MISSING | `packages/shared/src/types.ts`, mobile inventory screen | Add item metadata, grouping modes, editable stores/order, and store learning. |
| Price history, basket compare, unusual-charge flags | MISSING | No price history or comparison implementation found | Add shared unit parsing/price logic, persisted history, comparisons, and flags. |
| Recurring income/costs and transactions | MISSING | No recurring/transactions collections or screens found | Add deterministic materialization and include transactions in expense/budget calculations. |
| Savings goals | MISSING | No goals model or screen found | Add baselines, progress/streak calculations, UI, and milestone events. |
| Discount savings and best deals | MISSING | `packages/shared/src/expenseAnalytics.ts` | Add negative non-deposit discount rollups and best-deal summaries. |
| Weekly summary notifications/cards | MISSING | `functions/src/reminder.ts`, `functions/src/reminderLogic.ts` | Add household-timezone schedule, per-member preferences, push and in-app summary cards. |
| German bank CSV import and undo | MISSING | No bank import or transaction implementation found | Add safe parser/encoding support, mapping, duplicate matching, transaction import, and undo batch. |
| Meal suggestions and voice add | MISSING | No meal or voice callable/screen implementation found | Add validated callable workflows and confirmation UIs; avoid sending unnecessary personal data. |
| English/German i18n and missing-key test | MISSING | UI strings are inline across both apps | Add shared translation resources and completeness tests. |
| Dark mode and theme settings | MISSING | Fixed light green theme in `apps/web/src/style.css` and mobile styles | Add shared theme tokens and per-member theme selection. |
| Scan quality and multiple receipt images | MISSING | Single-image APIs in both receipt screens and `functions/src/scanReceipt.ts` | Add quality analysis, retake/use-anyway UI, and ordered multi-image parsing. |
| Home-screen widgets | MISSING | No widget packages/configuration found | Implement only if supported by a safe native build; document platform gaps. |
| Test coverage for requested new behaviors | PARTIAL | `packages/shared/test`, `functions/test` | Add regressions alongside each new shared or backend feature, plus Firestore Rules emulator tests. |

## Assumptions

- The existing `kitchen/main` data path remains canonical; no collection migration is performed.
- The production Firebase project is never modified by this work. Validation uses local tests and the `demo-my-kitchen` emulators only.
- Current receipt and expense records remain readable during membership rollout. The legacy verified-owner rules fallback remains until the owner manually verifies bootstrap.
- Native Android/iOS projects are generated build output and are not source-of-truth; Expo app config and source assets are retained.
- Features that depend on third-party console credentials, paid services, native development builds, or owner configuration remain opt-in and are documented rather than represented as already configured.

## Known gaps

- The requested feature list exceeds the current implementation; see each row above for the audit and plan. Implementation should prioritize access control and the budget alert ladder before broad UI expansion.
- No production deployment is performed. The owner must review and manually deploy any rules or Functions changes.
- Push notifications are currently disabled by `PUSH_NOTIFICATIONS_ENABLED` in `apps/mobile/src/push.ts`.
