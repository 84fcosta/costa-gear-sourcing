import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabase";
import { updatePricingInputs } from "../services/pricingRepository";

const buttonStyle = disabled => ({
  border: 0,
  background: disabled ? "#D9DDD4" : "linear-gradient(180deg,#929A44,#747B31)",
  color: disabled ? "#647062" : "#fff",
  borderRadius: 8,
  padding: "8px 11px",
  fontWeight: 850,
  fontSize: 10.5,
  cursor: disabled ? "not-allowed" : "pointer",
  whiteSpace: "nowrap",
  minHeight: 34,
});

function findPricingToolbar() {
  const title = [...document.querySelectorAll("div")].find(el =>
    el.children.length === 0 && el.textContent?.trim() === "SKU Pricing Matrix"
  );
  if (!title) return null;
  const headerRow = title.parentElement?.parentElement;
  if (!headerRow) return null;
  const toolbar = headerRow.lastElementChild;
  return toolbar instanceof HTMLElement ? toolbar : null;
}

function skuFromRow(row) {
  const firstCell = row?.querySelector("td");
  const text = firstCell?.textContent || "";
  return text.match(/CG-[A-Z]+-\d+/i)?.[0]?.toUpperCase() || null;
}

function rowValues(row) {
  const inputs = [...row.querySelectorAll('input[type="number"]')];
  return {
    targetSellPriceCad: inputs[0]?.value ?? "",
    targetMarginPct: inputs[1]?.value ?? "",
    marketReferenceCad: inputs[2]?.value ?? "",
  };
}

export default function PricingMatrixBulkSaveControls() {
  const [target, setTarget] = useState(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const dirtyRows = useRef(new Set());

  const markRowClean = useCallback(row => {
    if (!row) return;
    dirtyRows.current.delete(row);
    row.style.background = "";
    row.removeAttribute("data-pricing-dirty");
  }, []);

  const refreshCount = useCallback(() => setDirtyCount(dirtyRows.current.size), []);

  const saveAll = useCallback(async () => {
    if (saving || dirtyRows.current.size === 0) return;
    setSaving(true);
    setStatus("");

    const rows = [...dirtyRows.current].filter(row => row.isConnected);
    const edits = rows.map(row => ({ row, sku: skuFromRow(row), values: rowValues(row) })).filter(x => x.sku);

    try {
      const skus = [...new Set(edits.map(x => x.sku))];
      const { data: products, error } = await supabase.from("products").select("id,sku_id").in("sku_id", skus);
      if (error) throw error;
      const bySku = new Map((products || []).map(product => [product.sku_id, product.id]));

      const results = await Promise.allSettled(edits.map(async edit => {
        const productId = bySku.get(edit.sku);
        if (!productId) throw new Error(`Product not found for ${edit.sku}`);
        await updatePricingInputs(productId, edit.values);
        return edit;
      }));

      const failed = [];
      let saved = 0;
      results.forEach((result, index) => {
        const edit = edits[index];
        if (result.status === "fulfilled") {
          saved += 1;
          markRowClean(edit.row);
        } else {
          failed.push(edit.sku);
        }
      });
      refreshCount();

      if (failed.length) {
        setStatus(`${saved} saved, ${failed.length} failed: ${failed.join(", ")}`);
      } else {
        setStatus(`${saved} product${saved === 1 ? "" : "s"} saved.`);
        window.setTimeout(() => {
          const refreshButton = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Refresh Pricing");
          refreshButton?.click();
          setStatus("");
        }, 250);
      }
    } catch (error) {
      setStatus(error?.message || "Unable to save pricing inputs.");
    } finally {
      setSaving(false);
    }
  }, [markRowClean, refreshCount, saving]);

  useEffect(() => {
    const locate = () => {
      const next = findPricingToolbar();
      setTarget(current => current === next ? current : next);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!target) return undefined;
    const headerRow = target.parentElement;
    const card = headerRow?.parentElement;
    if (!card) return undefined;

    const onInput = event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "number") return;
      const row = input.closest("tbody tr");
      if (!row || !card.contains(row)) return;
      dirtyRows.current.add(row);
      row.setAttribute("data-pricing-dirty", "true");
      row.style.background = "#FCFDF4";
      setStatus("");
      refreshCount();
    };

    const onClickCapture = event => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (!button || button.textContent?.trim() !== "Save Inputs" || dirtyRows.current.size === 0) return;
      event.preventDefault();
      event.stopPropagation();
      saveAll();
    };

    card.addEventListener("input", onInput, true);
    card.addEventListener("click", onClickCapture, true);
    return () => {
      card.removeEventListener("input", onInput, true);
      card.removeEventListener("click", onClickCapture, true);
    };
  }, [refreshCount, saveAll, target]);

  if (!target) return null;
  const disabled = saving || dirtyCount === 0;
  return createPortal(
    <>
      <button type="button" style={buttonStyle(disabled)} disabled={disabled} onClick={saveAll} title="Save all edited pricing inputs">
        {saving ? "Saving..." : `Save All Inputs${dirtyCount ? ` (${dirtyCount})` : ""}`}
      </button>
      {status && <span style={{fontSize:9.5,fontWeight:750,color:status.includes("failed") || status.includes("Unable") ? "#B65145" : "#4D7D57",alignSelf:"center",whiteSpace:"nowrap"}}>{status}</span>}
    </>,
    target
  );
}
