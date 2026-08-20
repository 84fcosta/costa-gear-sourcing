import { useEffect, useState } from "react";
import SalesWorkspace from "./SalesWorkspace";
import PerformanceWorkspace from "./PerformanceWorkspace";
import DemandPlanningWorkspace from "./DemandPlanningWorkspace";
import PricingIntelligenceWorkspace from "./PricingIntelligenceWorkspace";

export default function CommercialWorkspace({ initialView="orders", onNavigate }) {
  const [view,setView]=useState(initialView);
  useEffect(()=>setView(initialView),[initialView]);

  return <div className="cg-commercial-workspace">
    <div className="cg-subworkspace-header">
      <div className="cg-subworkspace-inner">
        <div>
          <div className="cg-subworkspace-title">Sales & Performance</div>
          <div className="cg-subworkspace-copy">Capture commercial activity, measure SKU performance, plan replenishment and improve pricing decisions.</div>
        </div>
        <div className="cg-segmented">
          <button className={view==="orders"?"active":""} onClick={()=>setView("orders")}>Sales Orders</button>
          <button className={view==="performance"?"active":""} onClick={()=>setView("performance")}>Performance</button>
          <button className={view==="planning"?"active":""} onClick={()=>setView("planning")}>Reorder Planning</button>
          <button className={view==="pricing"?"active":""} onClick={()=>setView("pricing")}>Pricing</button>
        </div>
      </div>
    </div>
    <div className="cg-commercial-content">
      {view==="orders"?<SalesWorkspace/>
        :view==="performance"?<PerformanceWorkspace/>
        :view==="planning"?<DemandPlanningWorkspace onNavigate={onNavigate}/>
        :<PricingIntelligenceWorkspace/>}
    </div>
  </div>;
}
