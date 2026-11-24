const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const lineQty = line => Math.max(0, Number(line?.quantity || 0));
const lineUnitPrice = line => Number(line?.unit_sell_price_cad ?? line?.unitSellPriceCad ?? 0);
const lineDiscountType = line => String(line?.discount_type ?? line?.discountType ?? "amount").toLowerCase();
const lineDiscountValue = line => {
  if (line?.discount_value !== undefined && line?.discount_value !== null) return Number(line.discount_value || 0);
  if (line?.discountValue !== undefined && line?.discountValue !== null) return Number(line.discountValue || 0);
  if (line?.discount_cad !== undefined && line?.discount_cad !== null) return Number(line.discount_cad || 0);
  return Number(line?.discountCad || 0);
};
const orderDiscountType = order => String(order?.order_discount_type ?? order?.orderDiscountType ?? "none").toLowerCase();
const orderDiscountValue = order => Number(order?.order_discount_value ?? order?.orderDiscountValue ?? 0);

export function lineGrossCad(line) {
  return round2(lineQty(line) * lineUnitPrice(line));
}

export function calculateLineDiscountCad(line) {
  const gross = lineGrossCad(line);
  const type = lineDiscountType(line);
  const value = Math.max(0, lineDiscountValue(line));
  if (type === "percentage") return round2(gross * clamp(value, 0, 100) / 100);
  return round2(clamp(value, 0, gross));
}

export function lineNetBeforeOrderCad(line) {
  return round2(Math.max(0, lineGrossCad(line) - calculateLineDiscountCad(line)));
}

export function calculateOrderDiscountCad(order, subtotalAfterLineDiscountCad) {
  const subtotal = Math.max(0, Number(subtotalAfterLineDiscountCad || 0));
  const type = orderDiscountType(order);
  const value = Math.max(0, orderDiscountValue(order));
  if (type === "percentage") return round2(subtotal * clamp(value, 0, 100) / 100);
  if (type === "amount") return round2(clamp(value, 0, subtotal));
  return 0;
}

function allocateOrderDiscount(lines, order, preOrderNets) {
  const subtotal = round2(preOrderNets.reduce((sum, value) => sum + value, 0));
  const target = calculateOrderDiscountCad(order, subtotal);
  if (!target || !lines.length || subtotal <= 0) return { target, allocations: lines.map(() => 0) };

  const allocations = preOrderNets.map(net => round2(target * (net / subtotal)));
  let allocated = round2(allocations.reduce((sum, value) => sum + value, 0));
  let residual = round2(target - allocated);

  if (residual !== 0) {
    let index = 0;
    for (let i = 1; i < preOrderNets.length; i += 1) {
      if (preOrderNets[i] > preOrderNets[index]) index = i;
    }
    allocations[index] = round2(clamp(allocations[index] + residual, 0, preOrderNets[index]));
    allocated = round2(allocations.reduce((sum, value) => sum + value, 0));
    residual = round2(target - allocated);
    if (residual !== 0) {
      for (let i = 0; i < allocations.length && residual !== 0; i += 1) {
        const room = round2(preOrderNets[i] - allocations[i]);
        if (residual > 0 && room > 0) {
          const add = Math.min(room, residual);
          allocations[i] = round2(allocations[i] + add);
          residual = round2(residual - add);
        } else if (residual < 0 && allocations[i] > 0) {
          const take = Math.min(allocations[i], Math.abs(residual));
          allocations[i] = round2(allocations[i] - take);
          residual = round2(residual + take);
        }
      }
    }
  }
  return { target, allocations };
}

export function summarizeSale(order, lines = []) {
  const preOrderNets = lines.map(lineNetBeforeOrderCad);
  const orderAllocation = allocateOrderDiscount(lines, order, preOrderNets);
  const orderCostsCad = round2(
    Number(order?.payment_fee_cad ?? order?.paymentFeeCad ?? 0)
    + Number(order?.outbound_shipping_cad ?? order?.outboundShippingCad ?? 0)
    + Number(order?.other_costs_cad ?? order?.otherCostsCad ?? 0)
  );
  const finalNets = preOrderNets.map((value, index) => round2(Math.max(0, value - orderAllocation.allocations[index])));
  const netCad = round2(finalNets.reduce((sum, value) => sum + value, 0));

  const lineSummaries = lines.map((line, index) => {
    const grossCad = lineGrossCad(line);
    const itemDiscountCad = calculateLineDiscountCad(line);
    const orderDiscountCad = orderAllocation.allocations[index] || 0;
    const totalDiscountCad = round2(itemDiscountCad + orderDiscountCad);
    const lineNetCad = finalNets[index] || 0;
    const cogsCad = round2(Number(line?.unit_cost_cad ?? line?.unitCostCad ?? 0) * lineQty(line));
    const allocatedOrderCostsCad = netCad > 0
      ? round2(orderCostsCad * (lineNetCad / netCad))
      : round2(orderCostsCad / Math.max(1, lines.length));
    const profitCad = round2(lineNetCad - cogsCad - allocatedOrderCostsCad);
    return {
      grossCad,
      itemDiscountCad,
      orderDiscountCad,
      totalDiscountCad,
      netCad: lineNetCad,
      cogsCad,
      allocatedOrderCostsCad,
      profitCad,
      marginPct: lineNetCad > 0 ? profitCad / lineNetCad * 100 : null,
    };
  });

  const units = lines.reduce((sum, line) => sum + lineQty(line), 0);
  const grossCad = round2(lineSummaries.reduce((sum, line) => sum + line.grossCad, 0));
  const itemDiscountCad = round2(lineSummaries.reduce((sum, line) => sum + line.itemDiscountCad, 0));
  const orderDiscountCad = round2(orderAllocation.target);
  const totalDiscountCad = round2(itemDiscountCad + orderDiscountCad);
  const cogsCad = round2(lineSummaries.reduce((sum, line) => sum + line.cogsCad, 0));
  const profitCad = round2(netCad - cogsCad - orderCostsCad);

  return {
    units,
    grossCad,
    itemDiscountCad,
    orderDiscountCad,
    totalDiscountCad,
    netCad,
    cogsCad,
    orderCostsCad,
    profitCad,
    marginPct: netCad > 0 ? profitCad / netCad * 100 : null,
    lineSummaries,
  };
}

export function discountTypeLabel(type) {
  if (type === "percentage") return "%";
  if (type === "amount") return "CAD";
  return "None";
}
