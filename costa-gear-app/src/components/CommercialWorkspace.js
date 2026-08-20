import { useEffect, useMemo, useState } from "react";
import SalesWorkspace from "./SalesWorkspace";
import CommercialInsightsWorkspace from "./CommercialInsightsWorkspace";

function resolveInitial(initialView){
  if(initialView==="orders") return { view:"orders", insight:"overview" };
  if(initialView==="performance"||initialView==="planning"||initialView==="pricing") return { view:"insights", insight:initialView };
  return { view:"insights", insight:"overview" };
}

export default function CommercialWorkspace({ initialView="orders", onNavigate }) {
  const initial=useMemo(()=>resolveInitial(initialView),[initialView]);
  const [view,setView]=useState(initial.view);
  const [insightView,setInsightView]=useState(initial.insight);

  useEffect(()=>{
    const next=resolveInitial(initialView);
    setView(next.view);
    setInsightView(next.insight);
  },[initialView]);

  const openOrders=()=>setView("orders");
  const openInsights=()=>{setView("insights");setInsightView("overview");};

  return <div className="cg-commercial-workspace">
    <div className="cg-subworkspace-header">
      <div className="cg-subworkspace-inner">
        <div>
          <div className="cg-subworkspace-title">Sales</div>
          <div className="cg-subworkspace-copy">Record sales day to day. Open Business Insights only when you need deeper inventory, reorder or pricing support.</div>
        </div>
        <div className="cg-segmented">
          <button className={view==="orders"?"active":""} onClick={openOrders}>Sales Orders</button>
          <button className={view==="insights"?"active":""} onClick={openInsights}>Business Insights</button>
        </div>
      </div>
    </div>
    <div className="cg-commercial-content">
      {view==="orders"?<SalesWorkspace/>:<CommercialInsightsWorkspace key={insightView} initialInsight={insightView} onNavigate={onNavigate}/>} 
    </div>
  </div>;
}
