const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function shipmentFreightCad(shipment) {
  const amount = num(shipment?.freight_amount ?? shipment?.freightAmount) || 0;
  const currency = shipment?.freight_currency ?? shipment?.freightCurrency ?? "USD";
  const fx = num(shipment?.usd_cad_rate ?? shipment?.usdCadRate) || 1;
  return currency === "CAD" ? amount : amount * fx;
}

export function itemAllocationBasis({ method, item, product, quote, fxRate = 1 }) {
  const qty = num(item?.quantity) || 1;
  const weight = num(product?.weight_kg ?? product?.weightKg);
  const l = num(product?.length_cm ?? product?.lengthCm);
  const w = num(product?.width_cm ?? product?.widthCm);
  const h = num(product?.height_cm ?? product?.heightCm);
  const unitUsd = num(quote?.unit_price ?? quote?.unitPrice);

  if (method === "weight") return weight === null ? 0 : weight * qty;
  if (method === "volume") return [l,w,h].some(v => v === null) ? 0 : ((l*w*h)/1000000) * qty;
  if (method === "value") return unitUsd === null ? 0 : unitUsd * fxRate * qty;
  if (method === "quantity") return qty;
  if (method === "equal") return 1;
  return 0;
}

export function allocateFreight({ shipment, items = [], products = [], quotes = [] }) {
  const totalCad = shipmentFreightCad(shipment);
  const method = shipment?.allocation_method ?? shipment?.allocationMethod ?? "weight";
  const fx = num(shipment?.usd_cad_rate ?? shipment?.usdCadRate) || 1;

  if (method === "manual") {
    const rows = items.map(item => {
      const allocatedCad = num(item.manual_allocation_cad ?? item.manualAllocationCad) || 0;
      const qty = num(item.quantity) || 1;
      return { ...item, allocationBasis: null, allocatedCad, perUnitCad: allocatedCad / qty };
    });
    const allocatedTotalCad = rows.reduce((s,r) => s + r.allocatedCad, 0);
    return { totalCad, allocatedTotalCad, differenceCad: totalCad - allocatedTotalCad, method, rows, complete: Math.abs(totalCad - allocatedTotalCad) < 0.01 };
  }

  const enriched = items.map(item => {
    const product = products.find(p => p.id === (item.product_id ?? item.productId));
    const quote = quotes.find(q => q.id === (item.quote_id ?? item.quoteId));
    const basis = itemAllocationBasis({ method, item, product, quote, fxRate: fx });
    return { item, product, quote, basis };
  });
  const totalBasis = enriched.reduce((s,r) => s + r.basis, 0);
  const rows = enriched.map(({ item, basis }) => {
    const allocatedCad = totalBasis > 0 ? totalCad * basis / totalBasis : 0;
    const qty = num(item.quantity) || 1;
    return { ...item, allocationBasis: basis, allocatedCad, perUnitCad: allocatedCad / qty };
  });
  const allocatedTotalCad = rows.reduce((s,r) => s + r.allocatedCad, 0);
  return { totalCad, allocatedTotalCad, differenceCad: totalCad - allocatedTotalCad, totalBasis, method, rows, complete: totalBasis > 0 && Math.abs(totalCad - allocatedTotalCad) < 0.01 };
}
