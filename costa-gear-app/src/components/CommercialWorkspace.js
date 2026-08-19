import { useEffect, useState } from "react";
import SalesWorkspace from "./SalesWorkspace";
import InventoryPerformanceWorkspace from "./InventoryPerformanceWorkspace";

export default function CommercialWorkspace({ initialView = "orders" }) {
  const [view, setView] = useState(initialView);
  useEffect(() => setView(initialView), [initialView]);

  return <div className="cg-commercial-workspace">
    <div className="cg-subworkspace-header">
      <div className="cg-subworkspace-inner">
        <div>
          <div className="cg-subworkspace-title">Sales & Performance</div>
          <div className="cg-subworkspace-copy">Capture sales and turn inventory history into commercial decisions.</div>
        </div>
        <div className="cg-segmented">
          <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}>Sales Orders</button>
          <button className={view === "performance" ? "active" : ""} onClick={() => setView("performance")}>Inventory & Profitability</button>
        </div>
      </div>
    </div>
    {view === "orders" ? <SalesWorkspace /> : <InventoryPerformanceWorkspace />}
  </div>;
}
