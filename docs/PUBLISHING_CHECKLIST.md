# Website and app publishing checklist

The public website and legal pages are implemented in the web app. This checklist identifies the remaining account, legal, Firebase and store-console actions needed before release. No production deployment has been run from this workspace.

## Required before the website is public

- [ ] Complete `VITE_OPERATOR_NAME`, `VITE_OPERATOR_ADDRESS`, `VITE_SUPPORT_EMAIL` and `VITE_PRIVACY_EMAIL` in the production web build environment. These values appear publicly on the Imprint and privacy/support pages. Use a monitored address and confirm mail reaches the publisher.
- [ ] Review the Imprint against the publisher’s actual legal status and Austrian disclosure requirements. Add applicable company/register/VAT disclosures where required; this app cannot determine them.
- [ ] Have the privacy policy and terms reviewed for the publisher’s actual data-controller identity, legal bases, provider terms, retention, transfer safeguards and applicable jurisdictions. Do not publish the sample text as legal advice.
- [ ] In Firebase Hosting, wait until `shoppingcart.at` DNS records are detected and HTTPS is active. The web app uses `https://shoppingcart.at`; configure `www` separately if you want it.
- [ ] Add `shoppingcart.at` (and `www.shoppingcart.at` if used) to Firebase Authentication’s authorized domains and test Google popup sign-in from the live origin.
- [ ] Configure production Firebase web SDK values in the hosting build environment. Do not use emulator flags in production.
- [ ] Configure and review the production Functions parameters (`ALLOWED_EMAILS` only if claiming an uninitialized legacy household, and `ENFORCE_APP_CHECK`) and server-side `ANTHROPIC_API_KEY`. Follow [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md) for the coordinated household rollout.
- [ ] Verify all public routes directly on the hosted domain: `/`, `/privacy`, `/terms`, `/imprint`, `/support`, `/account-deletion` and `/app`.
- [ ] Confirm legal details, email links, canonical links and the sitemap after the production build. Configure a mailbox before advertising the contact addresses.

## Apple App Store

- [ ] Use the App Store Connect account for the publisher and complete the app record, bundle identifier, age rating, screenshots, support URL and privacy-policy URL (`https://shoppingcart.at/privacy`).
- [ ] Complete App Privacy disclosures from the actual shipped build and providers. Include Google/Firebase account identifiers, household content, receipt images sent to Anthropic for scanning, aggregate expense/budget data sent for AI summaries when requested, and push tokens if push is enabled.
- [ ] Publish a working account-deletion URL (`https://shoppingcart.at/account-deletion`) and verify the in-app Settings deletion control. Review Apple’s current account-deletion requirements; household owners must transfer ownership first, and full-household deletion is not currently self-service.
- [ ] Configure signing, privacy manifests/export-compliance answers, production OAuth clients and physical-device builds. Test sign-in, invitation, deletion, offline/error states and purchase flows with production-like configuration.

## Google Play

- [ ] Complete the Play Console app record, store listing, screenshots, content rating, target audience, countries, app access instructions and support URL.
- [ ] Complete the Data safety form from actual SDK/network behavior and the shipped build. Disclose Firebase/Google and Anthropic processing and any enabled push delivery.
- [ ] Publish and verify the account-deletion URL (`https://shoppingcart.at/account-deletion`) and in-app account deletion. Follow the current Play account-deletion policy, including its external web resource requirement.
- [ ] Configure Play App Signing, production OAuth client fingerprints, release build, testing tracks and policy declarations. Verify the app can be reviewed using a working test account/invitation flow.

## Release validation

- [ ] Run type-check, lint, unit tests and Firestore rules emulator tests from the release commit.
- [ ] Test Google sign-in, bootstrap, invited-member access, member removal, ownership transfer, member account deletion, receipt scanning and AI insights against the intended production configuration.
- [ ] Ensure logs and crash reporting contain no email addresses, names, receipt details, spending amounts, push tokens or invitation codes.
- [ ] Review current Firebase, Google, Anthropic and Expo terms, data-processing agreements, pricing, quotas and service-region configuration.
- [ ] Only after approvals, deploy Hosting, Functions and Firestore rules to the explicitly selected production project. Never infer the project from `.firebaserc`.

The app and website are not ready for unrestricted public launch until the publisher details, contact mailbox, legal review, production Firebase configuration, domain verification and store-console declarations are complete.
