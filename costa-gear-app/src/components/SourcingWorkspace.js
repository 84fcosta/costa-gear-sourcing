import { useState } from "react";
import LegacyApp from "../LegacyApp";
import SourcingDecisionLab from "./SourcingDecisionLab";
import { supabase } from "../supabase";
import { calculateQuoteLandedCost } from "../domain/sourcingIntelligence";
import { createPurchaseOrder, addPurchaseOrderItem } from "../services/purchaseOrderRepository";

const tabStyle = active => ({
  border: active ? "1px solid rgba(116,123,49,.72)" : "1px solid rgba(50,56,42,.12)",
  background: active ? "#747B31" : "#fff",
  color: active ? "#fff" : "#20251F",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer"
});
const qtyFromMoq = text => { const m = String(text || "").match(/\d+/); return m ? Math.max(1, Number(m[0])) : 1; };
const makePoRef = () => { const d = new Date(); return `PO-${d.toISOString().slice(0,10).replaceAll("-","")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}${String(d.getSeconds()).padStart(2,"0")}`; };

export default function SourcingWorkspace({ onNavigate }) {
  const [view, setView] = useState("master");
  const [handoffError, setHandoffError] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);

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

  return <div>
    {handoffError && <div style={{background:"#FFF1EF",color:"#B65145",padding:10,textAlign:"center",fontSize:12}}>{handoffError}</div>}
    <div style={{background:"#F3F4EF",borderBottom:"1px solid rgba(50,56,42,.10)",padding:"14px 18px"}}>
      <div style={{maxWidth:1560,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div><div style={{fontSize:18,fontWeight:850,color:"#20251F"}}>Sourcing</div><div style={{fontSize:12,color:"#647062",marginTop:2}}>Products, suppliers, quotes, RFQs and sourcing analysis in one workflow.</div></div>
        <div style={{display:"flex",gap:8}}><button style={tabStyle(view==="master")} onClick={()=>setView("master")}>Products & Quotes</button><button style={tabStyle(view==="analysis")} onClick={()=>setView("analysis")}>Decision Lab</button></div>
      </div>
    </div>
    {view==="master" ? <LegacyApp/> : <SourcingDecisionLab onCreateBuyingDecision={createBuyingDraft} handoffBusy={handoffBusy}/>} 
  </div>;
}
