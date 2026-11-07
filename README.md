# My Kitchen

My Kitchen is a household-based pantry, shopping-list, receipt, expense, budget, and spending-insights app. The workspace contains an Expo mobile app, a Vite web app, shared TypeScript logic, and Firebase Cloud Functions.

## Requirements

- Node.js 20 (the Cloud Functions runtime is Node 20) and npm
- Java 21 for the Firebase emulators
- Xcode and CocoaPods for local iOS builds; Android Studio and an Android SDK for local Android builds
- A Firebase project for using a remote backend; Firebase CLI for emulators and deployment

The root `package-lock.json` is the package manager source of truth. Install dependencies from the workspace root:

```sh
npm ci
```

## Configure Firebase

1. Create a Firebase project and register a **Web app**. Copy its web SDK settings into `apps/web/.env`, based on `apps/web/.env.example`.
2. Register an iOS app using the bundle identifier `com.ashokkarki.mykitchen` if you build iOS. Place its downloaded `GoogleService-Info.plist` at `apps/mobile/GoogleService-Info.plist` (the Expo app config already references this path). Use `apps/mobile/.env.example` to configure the mobile app's `EXPO_PUBLIC_FIREBASE_*` variables.
3. In Firebase Console, open **Authentication → Sign-in method**, enable Google, and choose a support email.
4. Create Google OAuth client IDs for the project: a Web client, an iOS client for `com.ashokkarki.mykitchen`, and an Android client for `com.ashokkarki.mykitchen` with the app's signing-certificate SHA-1 fingerprint. The iOS `CLIENT_ID` in `GoogleService-Info.plist` is the iOS client ID. Put the client IDs in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` in `apps/mobile/.env`. The web app uses Firebase's Google popup and does not need an OAuth client ID environment variable. If an ID is missing, the mobile app shows setup instructions instead of crashing.
5. In **Authentication → Settings → Authorized domains**, ensure `localhost` is listed for local web development. Add `127.0.0.1` if using that host directly, and add your production web domain before hosting there. The domain is the browser origin (not the Firebase `authDomain`).
6. To retain access to a pre-existing `kitchen/main` household during migration, configure the Functions parameter `ALLOWED_EMAILS` with its verified Google owner email(s). New verified Google accounts do not need an allowlist, invitation, or deployed bootstrap Function: the client creates a private `kitchen/{uid}` household under the Firestore rules. Deploy the reviewed Firestore rules before using this flow. Set `ENFORCE_APP_CHECK` to `false` for initial emulator/testing flows; enable it only after App Check providers are configured for both clients.
7. Keep actual `.env` files local. They are ignored by Git; do not paste them into issues or commit them. Firebase web API keys identify a project and are not authorization credentials. Receipt scanning and insights now rely on verified household membership rather than a client-shipped app key.
8. The project alias in `.firebaserc` identifies the linked Firebase project. Verify it before any command that can deploy or modify remote resources.

For emulator-only development, use a separate local app environment with the emulator flags set to `true` and project ID `demo-my-kitchen`; do not change production credentials merely to try the emulator. Web and mobile connect Auth at `127.0.0.1:9099`, Firestore at `127.0.0.1:8080`, and Functions at `127.0.0.1:5001`. Start the Auth and Firestore emulators with `npx firebase-tools emulators:start --only auth,firestore --project demo-my-kitchen`. The emulator UI is at `http://localhost:4000`.

## Run locally

### Web

With the required web `.env` in place:

```sh
npm run dev --workspace=@my-kitchen/web
```

Vite prints its local URL (normally `http://localhost:5173`).

### Mobile development build

Set up the native project once, or repeat prebuild after changing native dependencies or app configuration:

```sh
npx expo install expo-dev-client
npx expo prebuild --clean
npx expo run:ios
# or
npx expo run:android
```

Google OAuth is not supported in Expo Go: Expo Go uses an `exp://<ip>:<port>` redirect that does not match the native OAuth redirect. Build and open the custom development app instead. Add `--device` to install on a connected physical device. After the development build is installed, start Metro in development-client mode:

```sh
cd apps/mobile
npx expo start --dev-client
```

The iOS build/install has not been confirmed in this workspace; a previous build attempt was interrupted. Native directories may be generated locally by prebuild.
After installing a native module such as `expo-camera`, `expo-web-browser`, or AsyncStorage, rerun prebuild and rebuild the development client. The mobile receipt scanner uses an in-app camera preview with framing guides; users can also choose an existing photo. Changing OAuth client IDs in `.env` only requires restarting Metro; client IDs are not secrets, but should still remain out of source control.

## Local Firestore emulator and sample data

The seed command starts a **local Firestore emulator** with the explicit demo project ID and writes synthetic examples. It refuses to run unless Firebase sets `FIRESTORE_EMULATOR_HOST` to local port 8080 and `GCLOUD_PROJECT` to `demo-my-kitchen`.

```sh
npm run seed:emulator
```

The command seeds three synthetic German/Austrian-style receipts, sample pantry items, and weekly/monthly budgets. It does not seed real receipt images, connect to production, or create AI-generated data. Seed IDs are stable; rerunning updates those demo documents. Other emulator documents are not deleted.

To use the emulator in an app, configure a separate local app environment as described above, then run the emulator and app in separate terminals. The Firebase Emulator UI is available at `http://localhost:4000` while the emulator is running.

## Checks

From the workspace root:

```sh
npm run type-check
npm run lint
npm test
npm run build --workspace=@my-kitchen/web
npm run build --workspace=@my-kitchen/functions
```

## Shopping and item deletion

Checking a shopping-list item immediately moves it to the pantry; it remains visible as a checked purchase for receipt matching. Unchecking returns it to the shopping list. Search the shopping list by item name, or swipe right on an item to toggle its purchase status. Swipes use resistance and require a deliberate horizontal movement. Purchase updates require an online Firestore transaction.

In the pantry, use the minus and plus controls to subtract or add quantities, including decimals (up to nine decimal places, between 0 and 9999). For example, subtracting 0.5 from 1 leaves 0.5; subtracting another 0.25 leaves 0.25. A zero balance marks the item finished and adds it to the shopping list. Stock is red below 30% of its baseline and orange from 30% up to (but not including) 50%. The baseline is the total after a purchase, restock, or addition; existing items without a baseline use their current quantity until their first adjustment. Quantity adjustments use an online Firestore transaction to avoid lost updates.

The bell opens household notifications on web and mobile. Budget alerts are generated from saved receipts for active budgets when at least one household member has budget alerts enabled; thresholds begin at 70%. The notification inbox displays existing alerts and links budget alerts to the Budgets page; it does not generate alerts. Alerts and their read status are shared with the household and do not require push notifications. The budget evaluation Firebase Functions must be deployed for automatic alerts.

Deleting an item requires confirmation and offers undo for one minute across devices. The `purgeExpiredItems` scheduled Firebase function permanently deletes expired items on its next run, normally within a further minute; scheduler delays or failures can postpone physical deletion. Deploy the updated clients, Firestore rules, `items.deletedAt` collection-group index, and this function together. Older clients that delete directly will be denied by the updated rules and must be upgraded.

## Receipt scanning, AI insights, and costs

Receipt scanning and optional AI-written insight summaries run through Cloud Functions; provider credentials belong in Firebase Functions secrets, never client configuration. Scanning sends the selected receipt image to Anthropic. AI insights send aggregate spending context rather than receipt images. These features can incur Cloud Functions, Firebase, and Anthropic charges. Review current provider pricing, quotas, and data-processing terms before enabling them.

The receipt scan callable requires the `ANTHROPIC_API_KEY` secret. Firebase Secret Manager requires a billing-enabled Firebase/Google Cloud plan for deployment/use. Push notifications additionally require platform credentials (APNs for iOS and the corresponding Android/Expo configuration).

## Security and deployment warning

Any verified Google account can sign in and receives its own household as owner. An owner may create an optional email-locked, single-use invitation. Redeeming an invitation switches the account's active household and role to member; its original personal household and data are retained but are no longer active. These flows use the existing Firebase Authentication, Firestore, and Cloud Functions setup; no separate server is needed.

## Public website and publishing

The public landing page and policy pages are available at `/`, `/privacy`, `/terms`, `/imprint`, `/support`, and `/account-deletion`; the signed-in kitchen app starts at `/app`. The web production environment must include the publisher identity/address and monitored support/privacy emails described in `docs/PUBLISHING_CHECKLIST.md`. Complete the legal and store-console reviews before public release; the website copy is a starting point, not legal advice.

## Assumptions

- Existing `kitchen/main/**` data remains available to its existing members. Bootstrap maps existing members to that household and creates new personal households under `kitchen/{uid}`.
- Household invitation codes are bearer credentials: share them only with the intended partner. Email-locked invites compare the normalized verified Google email; only a hash of the code and email is stored.
- App Check enforcement remains disabled by default until both web and mobile App Check providers are configured. Enable it only after confirming valid app tokens reach callable functions.
- A household member may update shared kitchen data; role management remains owner-only. Reminder and budget-alert preferences are per member; timezone and discretionary categories remain shared. Other preference fields are initialized but not yet surfaced in the app.

## Known gaps

- Member leave/delete screens and owner account deletion with full-data export and typed confirmation are not implemented. Owners can create invitations, list/remove members, and transfer ownership in Settings.
- Per-member reminder and budget-alert settings are stored and read by the settings screens. Daily reminder scheduling, language/theme preferences, weekly summaries, and all in-app alert visibility are not yet fully member-scoped.
- App Check clients are not yet configured, so `ENFORCE_APP_CHECK` must remain false until that setup is completed.
- The legacy `ALLOWED_EMAILS` parameter is only needed to claim an uninitialized legacy `kitchen/main`; it does not restrict new accounts.
- The broader requested extensions listed in `docs/IMPLEMENTATION_STATUS.md` remain incomplete where marked PARTIAL or MISSING.
- The site’s Austrian publisher identity and contact fields are deliberately not invented. Configure them in the production web environment and review the Imprint/privacy policy before making `shoppingcart.at` public.

Deploy the access rules after reviewing the target project and confirming Google sign-in is enabled:

```sh
npx firebase-tools deploy --only firestore:rules --project kitchen-bfe0c
```

Deploy callable function authentication changes only after confirming required secrets and billing:

```sh
npx firebase-tools deploy --only functions --project kitchen-bfe0c
```

Deploy Hosting only after verifying the web environment and production build:

```sh
npm run build --workspace=@my-kitchen/web
npx firebase-tools deploy --only hosting --project kitchen-bfe0c
```
