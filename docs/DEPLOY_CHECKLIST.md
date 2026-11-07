# Household rollout checklist

This is a manual review checklist only. Do not deploy from this workspace; review the target project and perform any approved rollout separately.

1. Back up the current Firestore data. Existing households and records remain under `kitchen/main/**`; do not move or overwrite them as part of this rollout.
2. If the existing `kitchen/main` has not been bootstrapped, set `ALLOWED_EMAILS` to the verified owner email(s) so bootstrap can preserve that household. New accounts do not require this parameter or an invitation.
3. Keep `ENFORCE_APP_CHECK=false` until both app clients have configured App Check providers.
4. Build and run the Functions, shared, web, mobile, and Firestore rules tests against `demo-my-kitchen`. Verify new accounts receive separate `kitchen/{uid}` paths and user-account mappings.
5. Test invitations created by different household owners. Verify each invite records its target household, email-locked invites reject other verified emails, successful redemption switches the active household to member, and the code cannot be redeemed twice.
6. Review Firestore rules to confirm each account can read/write only its active household, cannot modify its `userAccounts/{uid}` mapping, and cannot access another household by guessing its ID.
7. Coordinate deployment of Functions, Firestore rules, and both app clients: clients now use the household ID returned by bootstrap, so deploying only one component can temporarily block access for old or new clients.
8. Retain the existing `ANTHROPIC_API_KEY` server-side. Remove obsolete secrets only after confirming no deployed function revision uses them.
9. Configure App Check for both clients, verify valid callable requests in the emulators and approved project, then enable `ENFORCE_APP_CHECK`.

Never use `.firebaserc` as proof that a command targets an emulator. Every local validation command must explicitly select `demo-my-kitchen`; no deployment or remote-resource mutation is part of this checklist's execution in the current task.
