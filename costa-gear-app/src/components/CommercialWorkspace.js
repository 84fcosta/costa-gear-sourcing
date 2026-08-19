import { useEffect, useState } from "react";
import SalesWorkspace from "./SalesWorkspace";
import PerformanceWorkspace from "./PerformanceWorkspace";

export default function CommercialWorkspace({ initialView="orders" }) {
  const [view,setView]=useState(initialView);
  useEffect(()=>setView(initialView),[initialView]);

  return <div className="cg-commercial-workspace">
    <div className="cg-subworkspace-header">
      <div className="cg-subworkspace-inner">
        <div>
          <div className="cg-subworkspace-title">Sales & Performance</div>
          <div className="cg-subworkspace-copy">Capture commercial activity and measure realized SKU performance.</div>
        </div>
        <div className="cg-segmented">
          <button className={view==="orders"?"active":""} onClick={()=>setView("orders")}>Sales Orders</button>
          <button className={view==="performance"?"active":""} onClick={()=>setView("performance")}>Performance</button>
        </div>
      </div>
    </div>
    <div className="cg-module-embedded">
      {view==="orders"?<SalesWorkspace/>:<PerformanceWorkspace/>}
    </div>
  </div>;
}
