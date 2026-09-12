import { useEffect, useState } from "react";
import LegacyApp from "../LegacyApp";
import SourcingDecisionLab from "./SourcingDecisionLab";
import SupplierQuotationWorkspace from "./SupplierQuotationWorkspace";
import SupplierIntakeWorkspace from "./SupplierIntakeWorkspace";
import ProductMediaStrip from "./ProductMediaStrip";
import SourcingDensityPolish from "./SourcingDensityPolish";
import SourcingSortControls from "./SourcingSortControls";
import SourcingCostIntegrityGuard from "./SourcingCostIntegrityGuard";
import MobileProductCostSnapshot from "./MobileProductCostSnapshot";
import MobileProductMaster from "./MobileProductMaster";
import MobileSuppliersWorkspace from "./MobileSuppliersWorkspace";
import DesktopProductSnapshotControls from "./DesktopProductSnapshotControls";
import DesktopProductMasterControls from "./DesktopProductMasterControls";
import DesktopSupplierControls from "./DesktopSupplierControls";
import { supabase } from "../supabase";
import { calculateQuoteLandedCost } from "../domain/sourcingIntelligence";
import { createBuyingDraftFromQuote } from "../services/purchaseOrderRepository";
import "../mobile-refinements.css";
import "../mobile-secondary-fixes.css";

const qtyFromMoq = text => { const m = String(text || "").match(/\d+/); return m ? Math.max(1, Number(m[0])) : 1; };

const legacyTabLabels = {
  dashboard: "Dashboard",
  products: "Products (",
  quotes: "Quote Register (",
  export: "Export / RFQ",
};

export default function SourcingWorkspace({ onNavigate, initialView = "intake" }) {
  const [view, setView] = useState(initialView === "images" ? "master" : initialView);
  const [handoffError, setHandoffError] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileLegacyTab, setMobileLegacyTab] = useState("dashboard");
  const [pendingLegacyTab, setPendingLegacyTab] = useState(null);
  const [quotationFocusId, setQuotationFocusId] = useState(null);

  useEffect(() => setView(initialView === "images" ? "master" : initialView), [initialView]);

  useEffect(() => {
    if (view !== "master" || !pendingLegacyTab) return undefined;
    let cancelled = false;
    let attempts = 0;

    const activate = () => {
      if (cancelled) return;
      const expected = legacyTabLabels[pendingLegacyTab];
      const buttons = Array.from(document.querySelectorAll(".cg-legacy-embedded button"));
      const target = buttons.find(button => {
        const text = String(button.textContent || "").trim();
        return pendingLegacyTab === "export" ? text === expected : text.startsWith(expected);
      });

      if (target) {
        target.click();
        setMobileLegacyTab(pendingLegacyTab);
        setPendingLegacyTab(null);
        return;
      }

      attempts += 1;
      if (attempts < 8) window.setTimeout(activate, 40);
    };

    const timer = window.setTimeout(activate, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [view, pendingLegacyTab]);

  const selectLegacyTab = tab => {
    setMobileMoreOpen(false);
    setMobileLegacyTab(tab);
    setPendingLegacyTab(tab === "suppliers" ? null : tab);
    if (view !== "master") setView("master");
  };

  const selectSourcingView = nextView => {
    setMobileMoreOpen(false);
    setView(nextView);
  };

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

  const mobileMoreActive = !["intake", "master"].includes(view) || ["suppliers", "quotes", "export"].includes(mobileLegacyTab);
  const showLegacyMaster = mobileLegacyTab !== "suppliers";

  return <div className={`cg-sourcing-workspace cg-sourcing-mobile-${mobileLegacyTab}`}>
    {handoffError && <div style={{background:"#FFF1EF",color:"#B65145",padding:10,textAlign:"center",fontSize:12,marginBottom:12}}>{handoffError}</div>}

    <div className="cg-sourcing-mobile-nav" aria-label="Sourcing mobile navigation">
      <button type="button" className={view === "intake" ? "active" : ""} onClick={() => selectSourcingView("intake")}>Intake</button>
      <button type="button" className={view === "master" && mobileLegacyTab === "dashboard" ? "active" : ""} onClick={() => selectLegacyTab("dashboard")}>Overview</button>
      <button type="button" className={view === "master" && mobileLegacyTab === "products" ? "active" : ""} onClick={() => selectLegacyTab("products")}>Products</button>
      <div className="cg-sourcing-mobile-more-wrap">
        <button type="button" className={mobileMoreActive || mobileMoreOpen ? "active" : ""} aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen(open => !open)}>More</button>
        {mobileMoreOpen && <div className="cg-sourcing-mobile-more-menu">
          <button type="button" className={view === "quotations" ? "active" : ""} onClick={() => selectSourcingView("quotations")}><strong>Supplier Quotations</strong><span>Review, match and finalize formal quotations</span></button>
          <button type="button" className={view === "analysis" ? "active" : ""} onClick={() => selectSourcingView("analysis")}><strong>Decision Lab</strong><span>Compare quotes and sourcing decisions</span></button>
          <button type="button" className={view === "master" && mobileLegacyTab === "suppliers" ? "active" : ""} onClick={() => selectLegacyTab("suppliers")}><strong>Suppliers</strong><span>Supplier directory and sourcing history</span></button>
          <button type="button" className={view === "master" && mobileLegacyTab === "quotes" ? "active" : ""} onClick={() => selectLegacyTab("quotes")}><strong>Quote Register</strong><span>Historical and comparable quote records</span></button>
          <button type="button" className={view === "master" && mobileLegacyTab === "export" ? "active" : ""} onClick={() => selectLegacyTab("export")}><strong>Export / RFQ</strong><span>Exports and RFQ builder</span></button>
        </div>}
      </div>
    </div>

    <div className="cg-subworkspace-header">
      <div className="cg-subworkspace-inner">
        <div><div className="cg-subworkspace-title">Sourcing</div><div className="cg-subworkspace-copy">One intake channel for supplier documents, then master data, quotation review and sourcing decisions.</div></div>
        <div className="cg-segmented"><button className={view === "intake" ? "active" : ""} onClick={() => setView("intake")}>Supplier Intake</button><button className={view === "master" ? "active" : ""} onClick={() => setView("master")}>Master Data</button><button className={view === "quotations" ? "active" : ""} onClick={() => setView("quotations")}>Supplier Quotations</button><button className={view === "analysis" ? "active" : ""} onClick={() => setView("analysis")}>Decision Lab</button></div>
      </div>
    </div>
    {view === "intake" && <div className="cg-module-embedded"><SupplierIntakeWorkspace onCompleteQuotation={quotationId => { setQuotationFocusId(quotationId); setMobileMoreOpen(false); setView("quotations"); }} /></div>}
    {view === "master" && <>
      {showLegacyMaster && <><SourcingDensityPolish /><SourcingSortControls /><SourcingCostIntegrityGuard /><ProductMediaStrip /></>}
      <MobileProductCostSnapshot active={mobileLegacyTab === "dashboard"} />
      <DesktopProductSnapshotControls active={showLegacyMaster} />
      <DesktopProductMasterControls active={showLegacyMaster} />
      <DesktopSupplierControls active={showLegacyMaster} />
      <MobileProductMaster active={mobileLegacyTab === "products"} />
      <MobileSuppliersWorkspace active={mobileLegacyTab === "suppliers"} onOpenSupplierIntake={() => { setQuotationFocusId(null); setMobileMoreOpen(false); setView("intake"); }} />
      {showLegacyMaster && <div className={`cg-legacy-embedded cg-legacy-mobile-${mobileLegacyTab}`}><LegacyApp onOpenSupplierQuotations={() => { setMobileMoreOpen(false); setView("quotations"); }} onOpenSupplierIntake={() => { setQuotationFocusId(null); setMobileMoreOpen(false); setView("intake"); }} /></div>}
    </>}
    {view === "quotations" && <div className="cg-module-embedded"><SupplierQuotationWorkspace onNavigate={onNavigate} initialQuotationId={quotationFocusId} onOpenIntake={() => { setQuotationFocusId(null); setMobileMoreOpen(false); setView("intake"); }} /></div>}
    {view === "analysis" && <div className="cg-module-embedded"><SourcingDecisionLab onCreateBuyingDecision={createBuyingDraft} handoffBusy={handoffBusy} /></div>}
  </div>;
}
