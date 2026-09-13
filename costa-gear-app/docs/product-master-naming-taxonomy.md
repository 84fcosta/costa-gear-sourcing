# Costa Gear Product Master Naming & Taxonomy Standard

## Product name convention

Use:

`<Product Type> – <Variant / Distinguishing Feature> – <Material>`

Rules:
- Product Type is mandatory and comes from the governed Product Type master.
- Variant is optional, but required when two SKUs would otherwise have the same product name.
- Material is included when confirmed. Do not infer a material from appearance or supplier family.
- Vehicle model, model year and fitment are normally excluded from Product Name because they are governed in structured fitment fields.
- Dimensions are normally excluded. Include a dimension only when it is the practical differentiator between otherwise similar physical variants.
- Supplier name, supplier SKU, quotation reference and marketplace wording never belong in Product Name.
- Use full words and stable descriptors. Avoid shorthand such as "W bracket", inconsistent casing, or mixed hyphen styles.
- Use the en dash separator ` – ` consistently.

## Category principles

Category is mandatory and comes from the governed Product Category master.

Classify products consistently by what the product physically is / its primary product class, rather than by supplier wording or sales channel.

Current canonical categories:
- Exterior – Protection
- Exterior – Lighting
- Exterior – Storage & Cargo
- Exterior – Access & Entry
- Exterior – Recovery
- Interior – Storage
- Interior – Mounting & Tech
- Interior – Comfort & Utility
- Interior – Protection
- Drivetrain & Suspension
- Other

## Current Product Master naming recommendations

| SKU | Recommended Product Name |
| --- | --- |
| CG-CB-01 | Roof Rack Cross Bars – Aluminum |
| CG-CB-02 | Roof Rack Cross Bars – Rounded Ends – Aluminum |
| CG-CR-01 | Rear Cargo Rack – Steel |
| CG-DS-01 | Door Sill Entry Guard Kit – TPE |
| CG-DS-02 | Door Sill Entry Guard Kit – ABS |
| CG-FM-01 | All-Weather Floor Mat Set – 4-Door – TPE |
| CG-FM-02 | All-Weather Floor Mat Set – 2-Door – TPE |
| CG-PH-01 | Dashboard Phone Mount – ABS |
| CG-PH-02 | Dashboard Storage Tray Phone Holder – Side-Clamp Cradle – ABS |
| CG-PH-03 | Dashboard Storage Tray Phone Holder – 3-Point Cradle – ABS |
| CG-PH-04 | Dashboard Storage Tray Phone Holder Kit – Dual Cradle – ABS |
| CG-PH-05 | Dashboard Storage Tray Phone Holder – 3-Point Cradle, 2024+ Design – ABS |
| CG-PH-06 | Dashboard Storage Tray Phone Holder Kit – Dual Cradle, 4xe Variant – ABS |
| CG-PH-07 | Dashboard Phone Holder – 3-Point Cradle – ABS |
| CG-PH-08 | Air Vent Phone Holder |
| CG-PH-09 | Dashboard Storage Box Phone Holder |
| CG-RB-01 | Running Board – OEM-Style 2-Door – ABS |
| CG-RB-02 | Running Board – OEM-Style 4-Door – ABS |
| CG-RR-01 | Roof Rack Platform – Aluminum |
| CG-RR-02 | Roof Rack Platform – Bracket-Mounted – Aluminum |
| CG-RR-03 | Roof Rack Platform – Bracket-Mounted 140 × 160 cm – Aluminum |
| CG-SK-01 | Interior Storage Organizer Kit – 4-Piece – ABS |
| CG-TT-01 | Tailgate Table – Foldable 2-Tier – Steel |
| CG-TT-02 | Tailgate Table – Foldable Single-Tier 76 cm – Steel |
| CG-TT-03 | Tailgate Table – Foldable Single-Tier 66.5 cm – Steel |
| CG-TT-04 | Tailgate Table – Foldable 2-Tier Cargo Shelf – Steel |

## Items requiring evidence before the naming migration

- CG-PH-08: current Product Master material is ABS, but the notes say material is not confirmed.
- CG-PH-09: current Product Master material is ABS, but the notes say material is not confirmed.

Do not include ABS in the governed name for these two SKUs until material evidence is confirmed.

## Category audit applied

- Door Sill Entry Guard products moved to `Exterior – Protection`.
- Floor Mat products moved to `Interior – Protection`.
- All category punctuation normalized to the canonical en dash form.
- All existing products now have an active governed Product Category.
