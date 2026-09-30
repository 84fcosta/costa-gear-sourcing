const assert = require("assert");
const fs = require("fs");
const path = require("path");

const reviewPath = path.join(__dirname, "..", "src", "domain", "quotationReview.js");
const reviewCode = fs.readFileSync(reviewPath, "utf8");
const ui = fs.readFileSync(path.join(__dirname, "..", "src", "components", "SupplierQuotationWorkspace.js"), "utf8");

(async () => {
  const api = await import("data:text/javascript;base64," + Buffer.from(reviewCode).toString("base64"));
  const first = {
    supplier_description: "Side Tent Vinyl version | 160*250*200 CM",
    original_notes: "Open size: 160*250*200 CM; Packaging size: 168*13*13 CM; Weight (KG): 9.3.",
  };
  const second = {
    supplier_description: "Side Tent Vinyl version | 200*250*200 CM",
    original_notes: "Open size: 200*250*200 CM; Packaging size: 217*13*13 CM; Weight (KG): 10.6.",
  };
  const firstProduct = {length_cm:168,width_cm:13,height_cm:13};
  const secondProduct = {length_cm:217,width_cm:13,height_cm:13};
  assert.strictEqual(api.supplierPackagingReference(first.original_notes).raw, "168*13*13 CM");
  assert.strictEqual(api.supplierPackagingReference(second.original_notes).raw, "217*13*13 CM");
  assert.strictEqual(api.dimensionWarning(first,firstProduct),null);
  assert.strictEqual(api.dimensionWarning(second,secondProduct),null);
  assert.match(api.dimensionWarning(first,secondProduct),/Supplier packaging/);
  assert.match(api.dimensionWarning({supplier_description:first.supplier_description},firstProduct),/same basis/);

  const quote = {currency:"USD",product_subtotal:1264,shipping_total:475,grand_total:1739};
  const lines = [
    {quantity:1,unit_price:62,supplier_line_total:62},
    {quantity:1,unit_price:64,supplier_line_total:64},
  ];
  const result=api.quotationTotalReview(quote,lines);
  assert.strictEqual(result.lineSum,126);
  assert.strictEqual(result.subtotalMismatch,true);
  assert.strictEqual(result.subtotalDifference,1138);
  assert.strictEqual(result.grandTotalMismatch,false);
  assert.strictEqual(api.quotationTotalReview({...quote,product_subtotal:126,grand_total:601},lines).subtotalMismatch,false);

  assert.match(ui,/quotationTotalReview\(selected,lines\)/);
  assert.match(ui,/Imported line totals:/);
  assert.match(ui,/editing the OneDrive file alone/i);
  assert.match(ui,/Enter the actual USD\/CAD rate/);
  assert.match(ui,/supplierPackagingReference\(line\?\.original_notes\)/);
  assert.match(ui,/validationProblems===0&&Number\(finalizeForm\.usdCadRate\)>0/);
  process.stdout.write("Supplier quotation diagnostics and size-basis regression test passed.\n");
})().catch(error => { console.error(error); process.exitCode=1; });
