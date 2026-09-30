const positiveNumber = value => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const moneyNumber = value => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function productDimensions(product) {
  if (!product) return null;
  const values = [product.length_cm, product.width_cm, product.height_cm]
    .map(positiveNumber)
    .filter(value => value !== null);
  return values.length ? values : null;
}

export function formatDimensions(product) {
  const values = productDimensions(product);
  return values ? values.map(value => Number(value.toFixed(1))).join(" x ") + " cm" : "Not recorded";
}

export function supplierDimensionReference(text) {
  const match = String(text || "").replace(/,/g, ".").match(
    /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*[x×*]\s*(\d+(?:\.\d+)?))?\s*(mm|cm)\b/i
  );
  if (!match) return null;
  const factor = match[4].toLowerCase() === "mm" ? 0.1 : 1;
  return {
    raw: match[0],
    valuesCm: [match[1], match[2], match[3]].filter(Boolean).map(value => Number(value) * factor),
  };
}

export function supplierPackagingReference(notes) {
  const match = String(notes || "").match(
    /\b(?:packaging|package|carton)\s*(?:size|dimensions?)\s*[:=\-]\s*([^;\n]+)/i
  );
  return match ? supplierDimensionReference(match[1]) : null;
}

function dimensionsMatch(source, target) {
  if (source.length === target.length) {
    const sortedSource = [...source].sort((a, b) => a - b);
    const sortedTarget = [...target].sort((a, b) => a - b);
    return sortedSource.every((value, index) =>
      Math.abs(value - sortedTarget[index]) / Math.max(value, sortedTarget[index]) <= 0.15
    );
  }
  return source.every(value =>
    target.some(other => Math.abs(value - other) / Math.max(value, other) <= 0.15)
  );
}

export function dimensionWarning(line, product) {
  const target = productDimensions(product);
  if (!target || target.length < 2) return null;

  // When the supplier provides both open and packaging sizes, compare the
  // stored dimensions with the explicit packaging reference, not open size.
  const packaging = supplierPackagingReference(line?.original_notes);
  const reference = packaging || supplierDimensionReference(line?.supplier_description);
  if (!reference || reference.valuesCm.length < 2 || dimensionsMatch(reference.valuesCm, target)) return null;

  if (packaging) {
    return "Supplier packaging is " + packaging.raw + "; Costa Gear stored dimensions are " +
      formatDimensions(product) + ". Check that the records use the same packaging basis.";
  }
  return "Supplier description mentions " + reference.raw + "; Costa Gear record shows " +
    formatDimensions(product) + ". Confirm that both measurements refer to the same basis (product vs packaging).";
}

export function quotationTotalReview(quotation, lines) {
  if (!quotation || !Array.isArray(lines) || !lines.length) return null;
  const totals = lines.map(line => {
    const declared = moneyNumber(line.supplier_line_total);
    if (declared !== null) return declared;
    const quantity = moneyNumber(line.quantity);
    const unitPrice = moneyNumber(line.unit_price);
    return quantity !== null && unitPrice !== null ? quantity * unitPrice : null;
  });
  const lineSum = totals.every(value => value !== null)
    ? totals.reduce((sum, value) => sum + value, 0)
    : null;
  const subtotal = moneyNumber(quotation.product_subtotal);
  const shipping = moneyNumber(quotation.shipping_total);
  const grandTotal = moneyNumber(quotation.grand_total);
  const expectedGrandTotal = subtotal !== null && shipping !== null ? subtotal + shipping : null;
  return {
    lineSum,
    subtotal,
    shipping,
    grandTotal,
    expectedGrandTotal,
    subtotalMismatch: lineSum !== null && subtotal !== null && Math.abs(subtotal - lineSum) >= 0.01,
    subtotalDifference: lineSum !== null && subtotal !== null ? subtotal - lineSum : null,
    grandTotalMismatch: expectedGrandTotal !== null && grandTotal !== null &&
      Math.abs(expectedGrandTotal - grandTotal) >= 0.01,
  };
}
