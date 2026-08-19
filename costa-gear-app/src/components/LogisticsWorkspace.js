import { useState } from "react";
import ShipmentAllocationWorkspace from "./ShipmentAllocationWorkspace";
import ImportCostWorkspace from "./ImportCostWorkspace";

export default function LogisticsWorkspace({ initialView="shipments" }) {
  const [view, setView] = useState(initialView);
  return <div>
    <div className="cg-subworkspace-header">
      <div className="cg-subworkspace-inner">
        <div>
          <div className="cg-subworkspace-title">Logistics & Landed Cost</div>
          <div className="cg-subworkspace-copy">Manage shipments, freight, duty and import costs in one flow.</div>
        </div>
        <div className="cg-segmented">
          <button className={view === "shipments" ? "active" : ""} onClick={() => setView("shipments")}>Shipments</button>
          <button className={view === "costs" ? "active" : ""} onClick={() => setView("costs")}>Import Costs</button>
        </div>
      </div>
    </div>
    <div className="cg-module-embedded">
      {view === "shipments" ? <ShipmentAllocationWorkspace/> : <ImportCostWorkspace/>}
    </div>
  </div>;
}
