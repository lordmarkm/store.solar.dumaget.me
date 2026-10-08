---
name: firebase-firestore
description: >-
  Sets up, manages, queries, and configures Cloud Firestore databases (Standard/Enterprise edition), including data modeling, security rules, indexes, and SDK integrations (Web, Python, iOS, Android, Flutter). Use when creating/listing Firestore databases, defining data models/indexes, writing SDK queries, or integrating Firestore SDKs. For authoring or modifying Firestore Security Rules (firestore.rules), delegate to the firestore-rules-author subagent if subagent delegation is available, or use firestore-rules-creation otherwise. Don't use for Firebase Hosting, Data Connect, Auth, Storage/GCS, Crashlytics, Functions, or BigQuery.
compatibility: This skill is best used with the Firebase CLI, but does not require it. Firebase CLI can be accessed through `npx -y firebase-tools@latest`.
metadata:
  author: Google LLC
  category: Databases
---

# Cloud Firestore Database and Operations

## Storefront cost-first override (2026-10-07)

This local addition applies only to `store.solar.dumaget.me` using Firebase project
`dumaget-me-solar` and named database `store-dev`; do not impose it on unrelated
projects. It overrides the upstream Enterprise default below and any conflicting
recommendations in linked references or companion Firebase skills.

- Prefer the simplest adequate, lower-cost design. Standard edition is the
  planning default for a new store database; validate requirements and location
  before provisioning. Do not select Enterprise or enable optional paid features
  just because a skill recommends them. Present a concrete need, simpler
  alternatives and expected cost, and obtain explicit approval for exceptions.
- Keep `store-dev` explicit; never switch to `(default)` solely to save money.
  Named databases do not receive Standard edition's free quota; verify current
  [official pricing](https://cloud.google.com/firestore/pricing) before estimating.
  Prefer emulator-based development when cloud access is unnecessary.
- Use bounded queries/cursor pagination, only necessary indexes, and limited
  realtime subscriptions. Cache public catalog data where appropriate, but keep
  private data isolated and revalidate authoritative PO pricing/stock on the server.
- Do not automatically add paid search/analytics infrastructure, PITR/backup/TTL
  features or always-on compute. Discuss recovery/retention needs and tradeoffs
  explicitly; never disable existing safeguards merely to reduce cost.
- Cost savings do not override authentication, ownership/admin enforcement,
  transactional correctness or locked-PO history. Preserve the Auth activation
  hold and private credentials; no provisioning, migration, deletion, billing/IAM
  change or deployment is authorized by this skill.
- Read the project's `docs/INFRASTRUCTURE.md` cost policy before backend setup.
  Keep this override when updating upstream files; other projects retain their
  own policy. For an existing database, inspect its actual edition rather than
  attempting to change or recreate it to match a planning default.

> [!IMPORTANT] **Security Rules Authoring (`firestore.rules`)**
> Whenever your task requires creating, authoring, or modifying `firestore.rules`:
> - **If subagent delegation AND the `firestore-rules-author` subagent are available**: delegate authoring `firestore.rules` to the `firestore-rules-author` subagent rather than writing `firestore.rules` directly in the main agent.
> - **If subagent delegation is unavailable** (e.g., subagents not enabled in the IDE) **OR `firestore-rules-author` is not installed**: read and follow the `firestore-rules-creation` skill to write `firestore.rules` directly.

Before setting up dependencies, writing data models, or configuring security
rules, you MUST always identify the Firestore instance edition.

## 1. Instance Selection and Edition Detection

Run the following command to list current Firestore databases:

```bash
npx -y firebase-tools@latest firestore:databases:list
```

### A. Instance Found

1. For each database found, inspect its edition and details:

    ```bash
    npx -y firebase-tools@latest firestore:databases:get <database-id>
    ```
1. Ask the user which database instance they wish to target or if they would
   prefer to create a new instance.
1. Once the target instance is established:
   - If the **`edition`** is `STANDARD`, follow the guides under
     `references/standard/`.
   - If the **`edition`** is `ENTERPRISE` or native mode, follow the guides
     under `references/enterprise/`.

### B. No Instance Found (or New Requested)

For projects outside the scoped storefront override, upstream guidance defaults
to **Enterprise** edition. For the storefront, follow the cost-first override
instead: prefer Standard unless an exception is explicitly justified and approved.
Ask the user what location to use before any authorized creation. Run
`npx -y firebase-tools@latest firestore:locations` to get the list of options.
Suggest colocating with other resources if applicable.

Only after edition/location are agreed and creation is authorized, create the
database using the selected edition, not a hard-coded Enterprise default:

```bash
npx -y firebase-tools@latest firestore:databases:create <database-id> --edition="<selected-edition>" --location="<selected-location>"
```

Proceed with the guides for the selected edition under `references/standard/` or
`references/enterprise/`.

______________________________________________________________________

## 2. Specialized Guides

Based on the identified or created instance edition, open and read the
corresponding reference guides:

### Standard Edition (`references/standard/`)

- **Provisioning**: Read [provisioning.md](references/standard/provisioning.md)
- **Security Rules**: See the `firestore-rules-creation` skill
- **SDK Usage**: Read [web_sdk_usage.md](references/standard/web_sdk_usage.md),
  [android_sdk_usage.md](references/standard/android_sdk_usage.md),
  [ios_setup.md](references/standard/ios_setup.md), or
  [flutter_setup.md](references/standard/flutter_setup.md)
- **Indexes**: Read [indexes.md](references/standard/indexes.md)

### Enterprise Edition / Native Mode (`references/enterprise/`)

- **Provisioning**: Read
  [provisioning.md](references/enterprise/provisioning.md)

- **Data Model**: Read [data_model.md](references/enterprise/data_model.md)

- **Security Rules**: See the `firestore-rules-creation` skill

- **SDK Usage**:

  > [!CRITICAL] **Mandatory Reference Reading** Before writing or modifying any
  > application code for Firestore Enterprise Edition, you **MUST** read at
  > least one of the relevant reference documents below for the target
  > platform/language to understand specific architectural requirements and
  > pipeline initialization patterns.

  Read [web_sdk_usage.md](references/enterprise/web_sdk_usage.md),
  [python_sdk_usage.md](references/enterprise/python_sdk_usage.md),
  [android_sdk_usage.md](references/enterprise/android_sdk_usage.md),
  [ios_setup.md](references/enterprise/ios_setup.md), or
  [flutter_setup.md](references/enterprise/flutter_setup.md)

- **Indexes**: Read [indexes.md](references/enterprise/indexes.md)
