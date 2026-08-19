import { useEffect, useState } from "react";
import SalesWorkspace from "./SalesWorkspace";
import PerformanceWorkspace from "./PerformanceWorkspace";
import DemandPlanningWorkspace from "./DemandPlanningWorkspace";

export default function CommercialWorkspace({ initialView="orders", onNavigate }) {
  const [view,setView]=useState(initialView);
  useEffect(()=>setView(initialView),[initialView]);

  return <div className="cg-commercial-workspace">
    <div className="cg-subworkspace-header">
      <div className="cg-subworkspace-inner">
        <div>
          <div className="cg-subworkspace-title">Sales & Performance</div>
          <div className="cg-subworkspace-copy">Capture commercial activity, measure SKU performance and turn demand into replenishment decisions.</div>
        </div>
        <div className="cg-segmented">
          <button className={view==="orders"?"active":""} onClick={()=>setView("orders")}>Sales Orders</button>
          <button className={view==="performance"?"active":""} onClick={()=>setView("performance")}>Performance</button>
          <button className={view==="planning"?"active":""} onClick={()=>setView("planning")}>Reorder Planning</button>
        </div>
      </div>
    </div>
    <div className="cg-commercial-content">
      {view==="orders"?<SalesWorkspace/>:view==="performance"?<PerformanceWorkspace/>:<DemandPlanningWorkspace onNavigate={onNavigate}/>} 
    </div>
  </div>;
}
