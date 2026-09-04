import { useEffect, useState } from "react";
import LegacyApp from "../LegacyApp";
import SourcingDecisionLab from "./SourcingDecisionLab";
import SupplierQuotationWorkspace from "./SupplierQuotationWorkspace";
import ProductImagesWorkspace from "./ProductImagesWorkspace";
import { supabase } from "../supabase";
import { calculateQuoteLandedCost } from "../domain/sourcingIntelligence";
import { createBuyingDraftFromQuote } from "../services/purchaseOrderRepository";

const qtyFromMoq = text => { const m = String(text || "").match(/\d+/); return m ? Math.max(1, Number(m[0])) : 1; };

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

      const fx = Number(quote.usd_cad_rate);
      if (!Number.isFinite(fx) || fx <= 0) {
        throw new Error("Confirm the USD/CAD rate on the quote before creating a buying draft.");
      }
      if (Math.abs(fx - 1.38) < 0.000001) {
        const confirmed = window.confirm("This quote uses USD/CAD 1.38, the legacy default rate. Confirm that 1.38 is correct for this buying decision. Select Cancel to review the quote first.");
        if (!confirmed) throw new Error("Buying draft cancelled. Review the quote's USD/CAD rate and try again.");
      }

      const landed = calculateQuoteLandedCost(quote);
      if (!landed?.complete || landed.totalCad === null || landed.totalCad === undefined) {
        throw new Error("Complete the quote's landed-cost inputs before creating a buying draft. Shipping and duty must be known, or the quote must be DDP.");
      }

      const created = await createBuyingDraftFromQuote({
        quoteId: quote.id,
        quantity: qtyFromMoq(quote.moq),
        landedCostPerUnitCad: landed.totalCad,
        targetSellPriceCad: context.targetSellPriceCad ?? null,
        decisionScore: context.decisionScore ?? null,
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
          <div className="cg-subworkspace-copy">Maintain products and suppliers, import complete supplier quotations, then compare and buy.</div>
        </div>
        <div className="cg-segmented">
          <button className={view === "master" ? "active" : ""} onClick={() => setView("master")}>Products & Quotes</button>
          <button className={view === "images" ? "active" : ""} onClick={() => setView("images")}>Product Images</button>
          <button className={view === "quotations" ? "active" : ""} onClick={() => setView("quotations")}>Supplier Quotations</button>
          <button className={view === "analysis" ? "active" : ""} onClick={() => setView("analysis")}>Decision Lab</button>
        </div>
      </div>
    </div>
    {view === "master" && <div className="cg-legacy-embedded"><LegacyApp /></div>}
    {view === "images" && <ProductImagesWorkspace />}
    {view === "quotations" && <div className="cg-module-embedded"><SupplierQuotationWorkspace onNavigate={onNavigate} /></div>}
    {view === "analysis" && <div className="cg-module-embedded"><SourcingDecisionLab onCreateBuyingDecision={createBuyingDraft} handoffBusy={handoffBusy} /></div>}
  </div>;
}
