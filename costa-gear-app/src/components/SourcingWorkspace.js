import { useEffect, useState } from "react";
import LegacyApp from "../LegacyApp";
import SourcingDecisionLab from "./SourcingDecisionLab";
import { supabase } from "../supabase";
import { calculateQuoteLandedCost } from "../domain/sourcingIntelligence";
import { createPurchaseOrder, addPurchaseOrderItem } from "../services/purchaseOrderRepository";

const qtyFromMoq = text => { const m = String(text || "").match(/\d+/); return m ? Math.max(1, Number(m[0])) : 1; };
const makePoRef = () => { const d = new Date(); return `PO-${d.toISOString().slice(0,10).replaceAll("-","")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}${String(d.getSeconds()).padStart(2,"0")}`; };

export default function SourcingWorkspace({ onNavigate, initialView = "master" }) {
  const [view, setView] = useState(initialView);
  const [handoffError, setHandoffError] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);

  useEffect(() => setView(initialView), [initialView]);

  const createBuyingDraft = async context => {
    if (!context?.quoteId || handoffBusy) return;
    setHandoffBusy(true); setHandoffError("");
    try {
      const { data: quote, error } = await supabase.from("quotes").select("*").eq("id", context.quoteId).single();
      if (error) throw error;
      const landed = calculateQuoteLandedCost(quote);
      const created = await createPurchaseOrder({
        poRef: makePoRef(), supplierId: context.supplierId || quote.supplier_id, status: "Draft",
        currency: "USD", usdCadRate: quote.usd_cad_rate || 1.38,
        notes: `Created from Sourcing Decision Lab. Decision Score ${context.decisionScore ?? "N/A"}.`
      });
      await addPurchaseOrderItem({
        purchaseOrderId: created.id, productId: context.productId, quoteId: quote.id,
        quantity: qtyFromMoq(quote.moq), moqText: quote.moq || null,
        supplierSku: quote.supplier_sku || null, unitPriceUsd: quote.unit_price,
        landedCostPerUnitCad: landed?.totalCad ?? null,
        targetSellPriceCad: context.targetSellPriceCad ?? null,
        notes: `Sourcing recommendation snapshot. Decision Score ${context.decisionScore ?? "N/A"}.`
      });
      onNavigate?.("buying", { type:"buying-draft-created", purchaseOrderId:created.id, poRef:created.po_ref });
    } catch (e) { setHandoffError(e?.message || "Unable to create buying draft."); }
    finally { setHandoffBusy(false); }
  };

  return <div className="cg-sourcing-workspace">
    {handoffError && <div style={{background:"#FFF1EF",color:"#B65145",padding:10,textAlign:"center",fontSize:12,marginBottom:12}}>{handoffError}</div>}
    <div className="cg-subworkspace-header">
      <div className="cg-subworkspace-inner">
        <div>
          <div className="cg-subworkspace-title">Sourcing</div>
          <div className="cg-subworkspace-copy">Products, suppliers, quotes, RFQs and sourcing analysis in one workflow.</div>
        </div>
        <div className="cg-segmented">
          <button className={view === "master" ? "active" : ""} onClick={() => setView("master")}>Products & Quotes</button>
          <button className={view === "analysis" ? "active" : ""} onClick={() => setView("analysis")}>Decision Lab</button>
        </div>
      </div>
    </div>
    {view === "master" ? <div className="cg-legacy-embedded"><LegacyApp /></div> : <div className="cg-module-embedded"><SourcingDecisionLab onCreateBuyingDecision={createBuyingDraft} handoffBusy={handoffBusy} /></div>}
  </div>;
}
