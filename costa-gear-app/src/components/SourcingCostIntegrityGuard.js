import { useCallback, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { calculateQuoteLandedCost, rankQuotes } from "../domain/sourcingIntelligence";

const DEFAULT_TARGET_MARKUP = 2.2;

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });
}

function exactHeading(text) {
  return Array.from(document.querySelectorAll("h1,h2,h3,h4,div,span")).find(node =>
    node.children.length === 0 && String(node.textContent || "").trim() === text
  ) || null;
}

function tableNearHeading(text) {
  const heading = exactHeading(text);
  if (!heading) return null;
  let node = heading.parentElement;
  for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
    const table = node.querySelector?.("table");
    if (table) return table;
  }
  return null;
}

function headerIndex(table, labels) {
  const headers = Array.from(table?.querySelectorAll("thead th") || []);
  return headers.findIndex(header => {
    const base = header.dataset.cgSortBaseLabel || String(header.textContent || "").replace(/[↑↓]/g, "").trim();
    return labels.includes(base);
  });
}

function quoteProductId(quote) {
  return quote?.product_id ?? quote?.productId;
}

function completeBestQuote(quotes) {
  return rankQuotes(quotes).find(item => item.landed?.complete && item.landed?.totalCad !== null) || null;
}

function targetSell(product, landedCad) {
  if (hasValue(product?.target_sell_price_cad)) return Number(product.target_sell_price_cad);
  if (hasValue(product?.target_margin_pct)) {
    const margin = Number(product.target_margin_pct) / 100;
    if (Number.isFinite(margin) && margin > 0 && margin < 0.95) return landedCad / (1 - margin);
  }
  return landedCad * DEFAULT_TARGET_MARKUP;
}

function setCell(cell, text, { color, title } = {}) {
  if (!cell) return;
  if (String(cell.textContent || "").trim() !== text) cell.textContent = text;
  if (color) cell.style.color = color;
  if (title) cell.setAttribute("title", title);
}

function leafNodes(root) {
  return Array.from(root?.querySelectorAll?.("div,span") || []).filter(node => node.children.length === 0);
}

function fixedAncestor(node) {
  let current = node;
  for (let depth = 0; current && depth < 12; depth += 1, current = current.parentElement) {
    if (current.style?.position === "fixed") return current;
  }
  return null;
}

function quoteQty(quote) {
  const match = String(quote?.moq || "").match(/\d+(?:\.\d+)?/);
  const qty = match ? Number(match[0]) : 1;
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function patchSummaryMetric(summary, label, value, { pending = false } = {}) {
  const labelNode = leafNodes(summary).find(node => String(node.textContent || "").trim() === label);
  if (!labelNode?.parentElement) return;
  const valueNode = Array.from(labelNode.parentElement.children).find(node => node !== labelNode);
  if (!valueNode) return;
  setCell(valueNode, value, {
    color: pending ? "#9A6C2F" : undefined,
    title: pending ? "This amount is pending because the quote does not have a complete landed-cost composition." : undefined,
  });
}

function patchQuoteLandedLabels(modalRoot, productQuotes) {
  const leaves = leafNodes(modalRoot);

  productQuotes.forEach(quote => {
    const supplierSku = String(quote.supplier_sku || "").trim();
    const supplierName = String(quote.supplier_name || "").trim();
    const anchor = leaves.find(node => {
      const text = String(node.textContent || "").trim();
      if (supplierSku && text.includes(`SKU: ${supplierSku}`)) return true;
      return !supplierSku && supplierName && text === supplierName;
    });
    if (!anchor) return;

    let card = anchor.parentElement;
    for (let depth = 0; card && depth < 6; depth += 1, card = card.parentElement) {
      const landedLabel = leafNodes(card).find(node => String(node.textContent || "").trim().startsWith("Est. landed:"));
      if (!landedLabel) continue;

      const landed = calculateQuoteLandedCost(quote);
      if (landed?.complete && landed.totalCad !== null) {
        setCell(landedLabel, `Est. landed: ${money(landed.totalCad)}`, {
          color: "#6B4E8B",
          title: "Complete landed cost using the same sourcing calculation used by Product Cost Snapshot.",
        });
      } else {
        setCell(landedLabel, "Est. landed: Pending freight/duty", {
          color: "#9A6C2F",
          title: "No landed cost is estimated until shipping and duty are known, or duty is covered by DDP.",
        });
      }
      break;
    }
  });
}

function applyProductDetailModals(products, quotes) {
  const summaryHeadings = Array.from(document.querySelectorAll("div,span")).filter(node =>
    node.children.length === 0 && String(node.textContent || "").includes("Landed Cost Summary, best quote")
  );
  if (!summaryHeadings.length) return;

  const productBySku = new Map(products.map(product => [product.sku_id, product]));
  const quotesByProduct = new Map();
  quotes.forEach(quote => {
    const id = quoteProductId(quote);
    if (!quotesByProduct.has(id)) quotesByProduct.set(id, []);
    quotesByProduct.get(id).push(quote);
  });

  summaryHeadings.forEach(heading => {
    const summary = heading.parentElement;
    const modalRoot = fixedAncestor(heading);
    if (!summary || !modalRoot) return;

    const sku = String(modalRoot.textContent || "").match(/CG-[A-Z]{2}-\d{2}/)?.[0];
    const product = productBySku.get(sku);
    if (!product) return;

    const productQuotes = quotesByProduct.get(product.id) || [];
    const best = completeBestQuote(productQuotes);

    if (!best) {
      ["Product (CAD)", "Shipping/unit", "Duty", "Brokerage/unit", "Other/unit", "Total Landed"].forEach(label =>
        patchSummaryMetric(summary, label, "Pending", { pending: true })
      );
      const basis = leafNodes(summary).find(node => String(node.textContent || "").trim().startsWith("Based on "));
      if (basis) {
        setCell(basis, "No quote has a complete landed-cost composition yet. Complete freight and duty inputs before comparing landed cost.", {
          color: "#9A6C2F",
        });
      }
      patchQuoteLandedLabels(modalRoot, productQuotes);
      return;
    }

    const { quote, landed } = best;
    patchSummaryMetric(summary, "Product (CAD)", money(landed.productCad));
    patchSummaryMetric(summary, "Shipping/unit", money(landed.shippingCad));
    patchSummaryMetric(summary, "Duty", money(landed.dutyCad));
    patchSummaryMetric(summary, "Brokerage/unit", money(landed.brokerageCad));
    patchSummaryMetric(summary, "Other/unit", money(landed.otherFeesCad));
    patchSummaryMetric(summary, "Total Landed", money(landed.totalCad));

    const dutyPct = hasValue(quote.duty_rate_pct)
      ? Number(quote.duty_rate_pct)
      : String(quote.incoterm || "").toUpperCase() === "DDP"
        ? 0
        : null;
    const basis = leafNodes(summary).find(node => String(node.textContent || "").trim().startsWith("Based on "));
    if (basis) {
      const fx = Number(quote.usd_cad_rate);
      const fxText = Number.isFinite(fx) ? fx : "pending";
      const dutyText = dutyPct === null ? "pending" : `${dutyPct}%`;
      setCell(
        basis,
        `Based on ${quote.supplier_name || "supplier"}, ${quote.incoterm || "Incoterm TBD"}, FX ${fxText}, duty ${dutyText}, quantity basis ${quoteQty(quote)}.`,
        { color: "#647062" }
      );
    }

    patchQuoteLandedLabels(modalRoot, productQuotes);
  });
}

function applySnapshotTable(products, quotes) {
  const table = tableNearHeading("Product Cost Snapshot");
  if (!table) return;

  const skuIdx = headerIndex(table, ["SKU"]);
  const shippingIdx = headerIndex(table, ["Shipping/unit CAD"]);
  const supplierIdx = headerIndex(table, ["Best Supplier"]);
  const landedIdx = headerIndex(table, ["Est. Landed CAD"]);
  const targetIdx = headerIndex(table, ["Target Sell CAD"]);
  if ([skuIdx, shippingIdx, supplierIdx, landedIdx, targetIdx].some(index => index < 0)) return;

  const productBySku = new Map(products.map(product => [product.sku_id, product]));
  const quotesByProduct = new Map();
  quotes.forEach(quote => {
    const id = quoteProductId(quote);
    if (!quotesByProduct.has(id)) quotesByProduct.set(id, []);
    quotesByProduct.get(id).push(quote);
  });

  Array.from(table.querySelectorAll("tbody tr")).forEach(row => {
    const sku = String(row.cells?.[skuIdx]?.textContent || "").trim();
    const product = productBySku.get(sku);
    if (!product) return;
    const productQuotes = quotesByProduct.get(product.id) || [];
    const best = completeBestQuote(productQuotes);

    if (!best) {
      setCell(row.cells?.[shippingIdx], "Pending", {
        color: "#9A6C2F",
        title: "No quote has a complete shipping and duty composition yet.",
      });
      setCell(row.cells?.[supplierIdx], "Pending landed cost", {
        color: "#9A6C2F",
        title: "Supplier price quotes exist, but none has a complete landed-cost composition.",
      });
      setCell(row.cells?.[landedIdx], "Pending", {
        color: "#9A6C2F",
        title: "Landed cost is intentionally not estimated with missing freight or duty.",
      });
      if (!hasValue(product.target_sell_price_cad)) {
        setCell(row.cells?.[targetIdx], "-", { color: "#70776D" });
      }
      return;
    }

    const { quote, landed } = best;
    setCell(row.cells?.[shippingIdx], money(landed.shippingCad), {
      color: "#4E6A8E",
      title: "Per-unit shipping used in the complete landed-cost calculation.",
    });
    setCell(row.cells?.[supplierIdx], quote.supplier_name || quote.supplierName || "-", {
      color: "#2F382E",
      title: "Best supplier among quotes with complete landed-cost composition.",
    });
    setCell(row.cells?.[landedIdx], money(landed.totalCad), {
      color: "#4D7D57",
      title: "Complete landed cost: product CAD + shipping + duty + brokerage + other fees.",
    });
    setCell(row.cells?.[targetIdx], money(targetSell(product, landed.totalCad)), {
      color: "#20251F",
      title: hasValue(product.target_sell_price_cad)
        ? "Manual target selling price stored in Product Master."
        : "Indicative target based on the complete landed cost.",
    });
  });
}

export default function SourcingCostIntegrityGuard() {
  const dataRef = useRef({ products: [], quotes: [] });
  const timerRef = useRef(null);

  const apply = useCallback(() => {
    const products = dataRef.current.products || [];
    const quotes = dataRef.current.quotes || [];
    applySnapshotTable(products, quotes);
    applyProductDetailModals(products, quotes);
  }, []);

  const load = useCallback(async () => {
    const [productsResult, quotesResult] = await Promise.all([
      supabase.from("products").select("id,sku_id,target_sell_price_cad,target_margin_pct"),
      supabase.from("quotes").select("id,product_id,supplier_name,supplier_sku,moq,unit_price,incoterm,shipping_cost,shipping_currency,shipping_cost_per_unit_cad,usd_cad_rate,duty_rate_pct,brokerage_cad,other_fees_cad,landed_cost_cad,quote_date,created_at"),
    ]);
    if (productsResult.error) throw productsResult.error;
    if (quotesResult.error) throw quotesResult.error;
    dataRef.current = {
      products: productsResult.data || [],
      quotes: quotesResult.data || [],
    };
    apply();
  }, [apply]);

  useEffect(() => {
    load().catch(error => console.error("Unable to validate sourcing landed costs", error));

    const schedule = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(apply, 60);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    const onFocus = () => load().catch(error => console.error("Unable to refresh sourcing landed costs", error));
    window.addEventListener("focus", onFocus);

    return () => {
      observer.disconnect();
      window.removeEventListener("focus", onFocus);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [apply, load]);

  return null;
}
