import { useState } from "react";
import BuyingDecisionWorkspace from "./components/BuyingDecisionWorkspace";
import ReceivingInventoryWorkspace from "./components/ReceivingInventoryWorkspace";
import OperationalDashboard from "./components/OperationalDashboard";
import SourcingWorkspace from "./components/SourcingWorkspace";
import LogisticsWorkspace from "./components/LogisticsWorkspace";
import WorkflowHandoffNotice from "./components/WorkflowHandoffNotice";
import BrandShell from "./components/BrandShell";

export default function App() {
  const [workspace, setWorkspace] = useState("dashboard");
  const [logisticsView, setLogisticsView] = useState("shipments");
  const [handoff, setHandoff] = useState(null);

  const navigate = (destination, context = null) => {
    if (context) setHandoff(context);
    if (destination === "shipments") { setLogisticsView("shipments"); setWorkspace("logistics"); return; }
    if (destination === "importcosts") { setLogisticsView("costs"); setWorkspace("logistics"); return; }
    if (destination === "operations" || destination === "intelligence") { setWorkspace("sourcing"); return; }
    setWorkspace(destination);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return <BrandShell active={workspace} onNavigate={navigate}>
    {workspace === "buying" && <WorkflowHandoffNotice handoff={handoff} onDismiss={() => setHandoff(null)} />}
    {workspace === "dashboard" ? <div className="cg-module-embedded"><OperationalDashboard onNavigate={navigate} /></div>
      : workspace === "sourcing" ? <SourcingWorkspace onNavigate={navigate} />
      : workspace === "buying" ? <div className="cg-module-embedded"><BuyingDecisionWorkspace /></div>
      : workspace === "logistics" ? <LogisticsWorkspace key={logisticsView} initialView={logisticsView} />
      : <div className="cg-module-embedded"><ReceivingInventoryWorkspace /></div>}
  </BrandShell>;
}
