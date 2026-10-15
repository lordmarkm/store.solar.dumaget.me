# <rule-id>: <title>

Copy this template to <rule-id>.md and replace all placeholders. Add the metadata
entry to index.json. This template itself is not a rule and must not be indexed.

## Metadata

```json
{
  "id": "replace-with-stable-kebab-case-id",
  "version": 1,
  "status": "planned",
  "category": "compatibility",
  "ownerRole": "builder-maintainers",
  "updatedOn": "YYYY-MM-DD",
  "implementedOn": null,
  "verifiedOn": null,
  "implementationPaths": [],
  "testPaths": []
}
```

## Intent and non-goals

Define the reason for this check, what a pass means and what it cannot establish.
State manufacturer/product-family restrictions. No inferred installer approval.

## Inputs and provenance

| Field | Type/unit | Origin | Required/allowed values | Missing or invalid behavior |
| --- | --- | --- | --- | --- |
| Replace with exact normalized keys | Replace | Published product or explicit build assignment | Replace | Explicit unknown/error handling |

Describe normalization, verified sources and boundary handling. Keys are proposed
until actual schema paths exist; do not mislabel examples as stored fields.

## Applicability and grouping

Define pair/group/row scope, explicit assignments, aggregation of repeated rows
and units, and when the rule returns unknown versus not-applicable.

## Deterministic evaluation

List numbered evaluation steps and result precedence. Specify every threshold,
comparison and assumption. Describe partial/missing and contradictory facts.
Keep any explanatory pseudocode clearly labeled non-executable.

## Outcomes and messages

| State | Reason code | Severity | Affected rows/missing facts | Message and resolution |
| --- | --- | --- | --- | --- |
| passed/incompatible/unknown/not-applicable | Stable code | error/warning/info | Explicit keys/IDs | Exact template and supported customer action |

Specify message variables and acknowledgement policy. No acknowledgement changes
the underlying state to passed or bypasses write authorization.

## Sources and evidence limits

For each source: ID, exact manual/datasheet identity, URL/revision/section,
supported fact, applicable products and verification date or explicit pending.
Keep empirical examples/synthetic fixtures separate from source evidence.

## Machine-readable examples

```json
{
  "fixtureSchemaVersion": 1,
  "cases": [
    {
      "id": "stable-case-id",
      "input": {},
      "expected": {
        "state": "unknown",
        "reasonCode": "replace-code",
        "severity": "warning",
        "affectedRowIds": [],
        "missingFacts": []
      }
    }
  ]
}
```

Provide pass, incompatible, unknown and not-applicable cases as applicable, plus
invalid data, boundaries, grouping and repeated rows/quantities. Define stable
output ordering if order is significant; otherwise define set comparisons.

## Code, tests and dependencies

Link actual paths and fixture IDs when implemented. Otherwise say not implemented.
List dependent rule IDs or none, shared inputs, product publication requirements
and affected UI behavior. Do not create fictional links to future files.

## Maintenance and change history

Record date, behavior version, change, reason, evidence and verification outcome.
Never claim implementation/source/test verification merely from writing the doc.
