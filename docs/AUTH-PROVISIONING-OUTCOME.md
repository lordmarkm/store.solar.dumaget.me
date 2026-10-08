# Google Auth provisioning outcome — 2026-10-06

Follow-up (2026-10-07): the user explicitly approved temporary local use of the
existing Google-only Identity Platform setup and Mark-only admin access. This
permits the documented local domain/client/API activation, not deletion, downgrade,
billing/IAM changes or advanced paid features. The subtype mismatch remains
historical fact, not a recovered configuration. See [activation record](AUTH-ACTIVATION.md).

## Intended and actual scope

The user approved standard Firebase Authentication with Google sign-in, then
supplied `mark@solar.dumaget.me` as the public support email. Firestore, shared
rules, Hosting, IAM and billing-plan changes were not authorized by that scope.

The current official firebase-tools Auth-only deploy implementation uses
`POST https://firebase.googleapis.com/v1alpha/firebase:provisionFirebaseApp`.
The submitted request targeted existing project `dumaget-me-solar` and app
`1:177959719186:web:1f99f7ab52c55a889723cb`, with Google provider enabled,
public display name `Dumaget.me Solar`, the supplied support email and `webInput: {}`.
No other feature inputs or billing settings were supplied.

Operation:
`operations/workflows/NmFhMTUwMTAtOTg2NS00ZTM5LThhYzktZDQ3YjI5NzRiMzU1`.
Request ID: `06836f97-cfd8-407a-b941-c7873dcbfc52`.
Operation completed with `done: true`, no error, and the existing app resource.

**Unexpected outcome:** project Auth configuration now has
`subtype: IDENTITY_PLATFORM`, not the intended standard `FIREBASE_AUTH`.
The console independently shows **Authentication with Identity Platform** and
Google **Enabled**. This was outside the intended/approved platform scope.

## Verified state and containment

- Before submission, config and provider-list GETs both returned 404.
- After submission, Google `google.com` is enabled; no other provider appeared.
- Authorized domains remain `dumaget-me-solar.firebaseapp.com` and
  `dumaget-me-solar.web.app`; no local/storefront domains were added.
- `STOREFRONT_AUTH_ENABLED` remains **false**. No user sign-in was attempted.
- Firestore database list remains empty. No shared rule, IAM or Hosting mutation
  was submitted. No user inventory, user deletion or secret output was performed.
- MFA remains disabled; no multi-tenancy or blocking functions were verified enabled.
- The console showed Blaze before and after provisioning. No billing association
  change was submitted. Cloud Billing API read returned 403 `SERVICE_DISABLED`;
  charges/usage were not verified, and that API was not enabled.
- Further cloud writes were stopped immediately after the subtype mismatch was
  detected. The user was informed, and frontend activation remains on hold.

## Recovery decision required

Update (2026-10-07): the user instructed us to always use the lowest-cost suitable
option and default new regional resources to Singapore. Standard Firebase Auth
remains the target; Identity Platform was not accepted. The region decision for
Firestore is now Standard / Native / `asia-southeast1`, named `store-dev`; no
database was created and Auth activation remains on hold.

Later on 2026-10-07, the user explicitly approved Firestore provisioning.
`store-dev` and its named-only deny-all rules are now provisioned; no Auth settings
were changed, and the activation hold remains. The earlier empty-database/no-cloud-
write statements describe the Auth incident and pre-provisioning state, not the
current Firestore inventory. See [provisioning record](FIRESTORE-PROVISIONING.md).

Official API schema marks Auth `subtype` as output-only and exposes initialization,
not a public downgrade method. Read-only console settings inspection found no
obvious downgrade action. This does not prove recovery is impossible. A safe
self-service reversal has not been established; Google support may be needed.

Do not delete Auth configuration/users, disable Identity Toolkit, change the
shared billing plan, or attempt undocumented mutation to reverse this. Do not
silently retain Identity Platform as an approved substitution. Establish a supported
recovery path before continuing domain configuration/frontend activation. Historical
Google forum guidance points to engineering/support assistance, but is not a
verified current self-service procedure. No support request was sent; sending one
requires user authorization. No safe downgrade was performed.

References: [official Auth-only CLI deploy](https://github.com/firebase/firebase-tools/blob/main/src/deploy/auth/deploy.ts),
[provisioning implementation](https://github.com/firebase/firebase-tools/blob/main/src/management/provisioning/provision.ts),
[Config subtype schema](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config),
[Google recovery guidance (historical)](https://discuss.google.dev/t/downgrade-google-identity-platform-back-to-firebase-authentication/46666),
[current Identity Platform pricing](https://cloud.google.com/identity-platform/pricing).
