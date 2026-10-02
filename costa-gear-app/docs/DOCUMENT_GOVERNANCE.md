# Costa Gear Document Governance

## Purpose

Document Governance is the cross-functional control layer for Costa Gear business documents.

It does **not** replace the operational modules where documents are created and used:

- Sourcing owns supplier documents and quotations.
- Buying owns purchase-order documents.
- Logistics owns shipment and landed-cost documents.
- Expenses owns operating-expense and asset documents.
- OneDrive stores the physical files.
- Supabase stores structured business records, document metadata and relationships.

Document Governance verifies that those layers remain consistent.

## Operating objectives

The module answers four questions:

1. **Naming** — Do active formal documents comply with the permanent naming convention?
2. **Storage** — Are documents stored in the expected governed repository area?
3. **Integrity** — Do OneDrive files, document metadata and business records still point to each other correctly?
4. **Exceptions** — What requires human attention?

## Views

### Overview

Shows the current repository health:

- active formal documents;
- naming-compliant documents;
- managed document-to-record link coverage;
- total governance exceptions.

### Naming

Shows only active naming exceptions.

A rename is permitted automatically only when the application can generate a validated proposal through the central naming framework. Ambiguous items remain review-only.

### Integrity

Cross-checks the physical OneDrive repository against Supabase document metadata and business records.

High-confidence checks include:

- document record points to a missing OneDrive file;
- file exists in a transactional repository area but has no expected business-record relationship;
- one OneDrive item is referenced by multiple document metadata rows;
- document metadata filename differs from the physical OneDrive filename;
- indexed linked entity no longer exists;
- formal document family is stored in a clearly incorrect governed folder.

### Exceptions

Provides one consolidated review queue containing Naming and Integrity findings.

The module surfaces problems but does not become a second operational document manager. Corrections to business records should normally be performed in the owning module.

## Scope and exclusions

Active formal documents are governed.

The following are excluded from active compliance monitoring until reactivated:

- `99_ARCHIVE`;
- Supplier Intake staging;
- visual assets such as product photos and marketing creatives.

## Legacy migration

Legacy migration is complete and is not part of the permanent Document Governance user interface.

Historical migration records remain in the database as an audit trail. One-time migration rules must never become defaults for future operational documents.
