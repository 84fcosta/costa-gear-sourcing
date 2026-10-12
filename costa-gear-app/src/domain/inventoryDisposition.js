export const DISPOSITION_TYPES = [
  {
    value: "prototype_internal_use",
    label: "Prototype / Internal Use",
    description: "Permanent internal use for fitment, testing, photography or product development.",
    defaultAccountingTreatment: "expense_now",
  },
  {
    value: "display_demo",
    label: "Display / Demo",
    description: "Permanent sample or demonstration unit no longer held for normal sale.",
    defaultAccountingTreatment: "expense_now",
  },
  {
    value: "damaged_unsellable",
    label: "Damaged / Unsellable",
    description: "Inventory with no normal sellable value.",
    defaultAccountingTreatment: "inventory_writeoff",
  },
  {
    value: "lost_missing",
    label: "Lost / Missing",
    description: "Inventory permanently unavailable after verification.",
    defaultAccountingTreatment: "inventory_writeoff",
  },
  {
    value: "returned_supplier",
    label: "Returned to Supplier",
    description: "Inventory removed because it is being returned to the supplier.",
    defaultAccountingTreatment: "supplier_return",
  },
  {
    value: "other_adjustment",
    label: "Other Adjustment",
    description: "Other permanent removal from sellable inventory.",
    defaultAccountingTreatment: "inventory_writeoff",
  },
];

export const ACCOUNTING_TREATMENTS = [
  {
    value: "expense_now",
    label: "Expense Now",
    description: "Reclassify inventory cost to Prototype / Product Development expense.",
  },
  {
    value: "capital_asset",
    label: "Capital Asset",
    description: "Reclassify inventory cost to a business capital asset for later CCA review.",
  },
  {
    value: "inventory_writeoff",
    label: "Inventory Write-off",
    description: "Recognize the inventory cost as an inventory loss / write-off.",
  },
  {
    value: "supplier_return",
    label: "Supplier Return",
    description: "Remove inventory and recognize supplier recovery or receivable.",
  },
];

export function dispositionTypeMeta(value) {
  return DISPOSITION_TYPES.find(item => item.value === value) || DISPOSITION_TYPES[DISPOSITION_TYPES.length - 1];
}

export function accountingTreatmentMeta(value) {
  return ACCOUNTING_TREATMENTS.find(item => item.value === value) || ACCOUNTING_TREATMENTS[0];
}

export function allowedAccountingTreatments(dispositionType) {
  if (dispositionType === "prototype_internal_use" || dispositionType === "display_demo") {
    return ACCOUNTING_TREATMENTS.filter(item => ["expense_now", "capital_asset"].includes(item.value));
  }
  if (dispositionType === "damaged_unsellable" || dispositionType === "lost_missing") {
    return ACCOUNTING_TREATMENTS.filter(item => item.value === "inventory_writeoff");
  }
  if (dispositionType === "returned_supplier") {
    return ACCOUNTING_TREATMENTS.filter(item => item.value === "supplier_return");
  }
  return ACCOUNTING_TREATMENTS.filter(item => ["expense_now", "capital_asset", "inventory_writeoff"].includes(item.value));
}

export function dispositionCost(disposition) {
  return (disposition?.inventory_disposition_lines || []).reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost_cad || 0),
    0
  );
}

export function dispositionCostComplete(disposition) {
  const lines = disposition?.inventory_disposition_lines || [];
  return lines.length > 0 && lines.every(line =>
    line.unit_cost_cad !== null
    && line.unit_cost_cad !== undefined
    && line.unit_cost_cad !== ""
    && Number.isFinite(Number(line.unit_cost_cad))
  );
}

export function summarizeDispositionUnits(dispositions = []) {
  const byProduct = new Map();
  for (const disposition of dispositions) {
    if (disposition.status !== "Posted") continue;
    const current = byProduct.get(disposition.product_id) || {
      total: 0,
      prototype: 0,
      display: 0,
      damaged: 0,
      lost: 0,
      returned: 0,
      other: 0,
    };
    const qty = Number(disposition.quantity || 0);
    current.total += qty;
    if (disposition.disposition_type === "prototype_internal_use") current.prototype += qty;
    else if (disposition.disposition_type === "display_demo") current.display += qty;
    else if (disposition.disposition_type === "damaged_unsellable") current.damaged += qty;
    else if (disposition.disposition_type === "lost_missing") current.lost += qty;
    else if (disposition.disposition_type === "returned_supplier") current.returned += qty;
    else current.other += qty;
    byProduct.set(disposition.product_id, current);
  }
  return byProduct;
}

export function dispositionLineQuantityByReceiptItem(dispositions = []) {
  const map = new Map();
  for (const disposition of dispositions) {
    if (disposition.status !== "Posted") continue;
    for (const line of disposition.inventory_disposition_lines || []) {
      map.set(line.receipt_item_id, (map.get(line.receipt_item_id) || 0) + Number(line.quantity || 0));
    }
  }
  return map;
}
