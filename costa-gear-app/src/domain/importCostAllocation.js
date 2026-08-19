const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toCad = (amount, currency, fx) => {
  const value = num(amount) || 0;
  return currency === "USD" ? value * (num(fx) || 1) : value;
};

export function allocateImportCosts({ shipment, items = [], products = [], quotes = [] }) {
  const fx = num(shipment?.usd_cad_rate) || 1;
  const method = shipment?.import_allocation_method || "value";
  const brokerageTotalCad = toCad(shipment?.brokerage_amount, shipment?.brokerage_currency, fx);
  const otherTotalCad = toCad(shipment?.other_import_costs_amount, shipment?.other_import_costs_currency, fx);

  const basisFor = (item) => {
    const qty = num(item.quantity) || 1;
    const product = products.find(p => p.id === item.product_id);
    const quote = quotes.find(q => q.id === item.quote_id);
    const weight = num(product?.weight_kg);
    const l = num(product?.length_cm);
    const w = num(product?.width_cm);
    const h = num(product?.height_cm);
    const unitUsd = num(quote?.unit_price);
    if (method === "weight") return weight === null ? 0 : weight * qty;
    if (method === "volume") return [l,w,h].some(v => v === null) ? 0 : ((l*w*h)/1000000) * qty;
    if (method === "value") return unitUsd === null ? 0 : unitUsd * fx * qty;
    if (method === "quantity") return qty;
    if (method === "equal") return 1;
    return 0;
  };

  if (method === "manual") {
    const rows = items.map(item => {
      const qty = num(item.quantity) || 1;
      const brokerageCad = num(item.manual_brokerage_cad) || 0;
      const otherCad = num(item.manual_other_import_cad) || 0;
      return { ...item, basis:null, brokerageCad, brokeragePerUnitCad: brokerageCad/qty, otherCad, otherPerUnitCad: otherCad/qty };
    });
    return {
      method,
      brokerageTotalCad,
      otherTotalCad,
      rows,
      brokerageDifferenceCad: brokerageTotalCad - rows.reduce((s,r)=>s+r.brokerageCad,0),
      otherDifferenceCad: otherTotalCad - rows.reduce((s,r)=>s+r.otherCad,0),
    };
  }

  const bases = items.map(item => ({ item, basis:basisFor(item) }));
  const totalBasis = bases.reduce((s,r)=>s+r.basis,0);
  const rows = bases.map(({item,basis}) => {
    const qty = num(item.quantity) || 1;
    const share = totalBasis > 0 ? basis / totalBasis : 0;
    const brokerageCad = brokerageTotalCad * share;
    const otherCad = otherTotalCad * share;
    return { ...item, basis, brokerageCad, brokeragePerUnitCad:brokerageCad/qty, otherCad, otherPerUnitCad:otherCad/qty };
  });
  return { method, brokerageTotalCad, otherTotalCad, totalBasis, rows, brokerageDifferenceCad:0, otherDifferenceCad:0 };
}
