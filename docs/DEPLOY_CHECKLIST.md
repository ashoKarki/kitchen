# Membership rollout checklist

This is a manual review checklist only. Do not deploy from this workspace; review the target project and perform any approved rollout separately.

1. Back up the current Firestore data and confirm the existing records remain under `kitchen/main/**`.
2. Set the Functions parameter `ALLOWED_EMAILS` to the normalized, comma-separated verified Google email(s) allowed to bootstrap an empty household. Set `ENFORCE_APP_CHECK=false` until App Check is configured.
3. Build and test the updated Functions in the `demo-my-kitchen` emulators. Confirm `bootstrapKitchen` initializes the existing owner without changing current settings or moving documents.
4. Review the member rules tests and bootstrap behavior. Deploy the Functions changes only after the owner has reviewed the target and configured the Anthropic secret required for scanning/insights.
5. Sign in with the intended owner and verify `kitchen/main.ownerUid`, `members`, `memberProfiles`, and `memberSettings/{uid}`. Create a test invitation and verify both an unlocked invitation and an email-locked invitation behave as expected.
6. Deploy the reviewed Firestore rules. Confirm that household members can access kitchen data, non-members cannot, members cannot modify membership metadata, and the original owner still has access through the temporary fallback.
7. Release web/mobile clients only after the new callable functions and reviewed rules are available. Confirm that the owner can sign in and a partner can join with the one-time invite code.
8. After both clients and membership access are verified, remove the clearly marked `REMOVE AFTER BOOTSTRAP VERIFIED` fallback from `firestore.rules` and deploy the reviewed rules again.
9. Remove the obsolete `APP_KEY` secret only after confirming no deployed function revision still references it. Keep `ANTHROPIC_API_KEY` server-side.
10. Configure App Check for both clients, verify valid callable requests in the emulators and the approved project, then enable `ENFORCE_APP_CHECK`.

Never use `.firebaserc` as proof that a command targets an emulator. Every local validation command must explicitly select `demo-my-kitchen`; no deployment or remote-resource mutation is part of this checklist's execution in the current task.
