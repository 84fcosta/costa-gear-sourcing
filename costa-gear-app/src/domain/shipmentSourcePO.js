const ELIGIBLE = new Set(["Approved", "Ordered", "Partially Received"]);
// Creation eligibility must not hide a historical relationship.
export function sourcePOOptions(orders, shipment) {
  const linkedId = shipment?.purchase_order_id;
  const options = (orders || []).filter(order => ELIGIBLE.has(order.status) || order.id === linkedId);
  if (linkedId && !options.some(order => order.id === linkedId)) {
    options.push({id: linkedId, po_ref: "Linked PO (details unavailable)", status: ""});
  }
  return options;
}
// Source PO is immutable in this edit form. Do not send it in a header update.
export function shipmentHeaderUpdate(form) {
  const payload = {...form};
  delete payload.purchaseOrderId;
  return payload;
}
