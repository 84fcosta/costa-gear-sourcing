import { useState } from "react";
import { Boxes, LayoutDashboard, PackageSearch, ShoppingCart, Truck } from "lucide-react";
import BuyingDecisionWorkspace from "./components/BuyingDecisionWorkspace";
import ReceivingInventoryWorkspace from "./components/ReceivingInventoryWorkspace";
import OperationalDashboard from "./components/OperationalDashboard";
import SourcingWorkspace from "./components/SourcingWorkspace";
import LogisticsWorkspace from "./components/LogisticsWorkspace";
import WorkflowHandoffNotice from "./components/WorkflowHandoffNotice";
import "./brand.css";

const navItems = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "sourcing", label: "Sourcing", Icon: PackageSearch },
  { id: "buying", label: "Buying", Icon: ShoppingCart },
  { id: "logistics", label: "Logistics", Icon: Truck },
  { id: "receiving", label: "Inventory", Icon: Boxes },
];

export default function App() {
  const [workspace, setWorkspace] = useState("dashboard");
  const [logisticsView, setLogisticsView] = useState("shipments");
  const [handoff, setHandoff] = useState(null);

  const navigate = (destination, context = null) => {
    if (context) setHandoff(context);
    if (destination === "shipments") {
      setLogisticsView("shipments");
      setWorkspace("logistics");
      return;
    }
    if (destination === "importcosts") {
      setLogisticsView("costs");
      setWorkspace("logistics");
      return;
    }
    if (destination === "operations" || destination === "intelligence") {
      setWorkspace("sourcing");
      return;
    }
    setWorkspace(destination);
  };

  return <div className="cg-app-shell">
    <header className="cg-brand-header">
      <div className="cg-brand-header-inner">
        <img className="cg-brand-logo" src="/costa-gear-logo.png" alt="Costa Gear Off-Road Accessories" />
      </div>
    </header>

    <nav className="cg-primary-nav" aria-label="Costa Gear operations navigation">
      <div className="cg-primary-nav-inner">
        {navItems.map(({ id, label, Icon }) => <button
          key={id}
          className={`cg-nav-button ${workspace === id ? "active" : ""}`}
          onClick={() => navigate(id)}
        >
          <Icon size={19} strokeWidth={2} />
          <span>{label}</span>
        </button>)}
      </div>
    </nav>

    <main className="cg-workspace">
      {workspace === "buying" && <WorkflowHandoffNotice handoff={handoff} onDismiss={() => setHandoff(null)} />}
      {workspace === "dashboard" ? <OperationalDashboard onNavigate={navigate} />
        : workspace === "sourcing" ? <SourcingWorkspace onNavigate={navigate} />
        : workspace === "buying" ? <BuyingDecisionWorkspace />
        : workspace === "logistics" ? <LogisticsWorkspace key={logisticsView} initialView={logisticsView} />
        : <ReceivingInventoryWorkspace />}
    </main>
  </div>;
}
