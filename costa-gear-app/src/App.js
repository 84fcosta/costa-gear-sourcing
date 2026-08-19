import { useState } from "react";
import {
  Boxes,
  DollarSign,
  LayoutDashboard,
  PackageSearch,
  ShoppingCart,
  Truck,
} from "lucide-react";
import BuyingDecisionWorkspace from "./components/BuyingDecisionWorkspace";
import ReceivingInventoryWorkspace from "./components/ReceivingInventoryWorkspace";
import OperationalDashboard from "./components/OperationalDashboard";
import SourcingWorkspace from "./components/SourcingWorkspace";
import LogisticsWorkspace from "./components/LogisticsWorkspace";
import CommercialWorkspace from "./components/CommercialWorkspace";
import WorkflowHandoffNotice from "./components/WorkflowHandoffNotice";
import "./brand.css";
import "./legacy-overrides.css";

const primaryNav = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "sourcing", label: "Sourcing", Icon: PackageSearch },
  { id: "buying", label: "Buying", Icon: ShoppingCart },
  { id: "logistics", label: "Logistics", Icon: Truck },
  { id: "receiving", label: "Inventory", Icon: Boxes },
  { id: "sales", label: "Sales", Icon: DollarSign },
];

const pageMeta = {
  dashboard: ["Operational Dashboard", "One view of sourcing readiness, buying commitments, logistics, inventory and commercial performance."],
  sourcing: ["Sourcing", "Manage products, suppliers, quotations, RFQs and sourcing decisions in one workspace."],
  buying: ["Buying Decisions & Purchase Orders", "Convert approved sourcing decisions into planned and ordered purchases."],
  logistics: ["Logistics & Landed Cost", "Manage shipments, freight allocation, duty and import costs from one workflow."],
  receiving: ["Receiving & Inventory", "Receive against shipments, confirm exceptions and maintain on-hand inventory."],
  sales: ["Sales & Performance", "Capture sales, reserve inventory and measure realized margin by SKU."],
};

export default function App() {
  const [workspace, setWorkspace] = useState("dashboard");
  const [sourcingView, setSourcingView] = useState("master");
  const [logisticsView, setLogisticsView] = useState("shipments");
  const [salesView, setSalesView] = useState("orders");
  const [handoff, setHandoff] = useState(null);

  const navigate = (destination, context = null) => {
    if (context) setHandoff(context);

    if (destination === "operations") {
      setSourcingView("master");
      setWorkspace("sourcing");
    } else if (destination === "intelligence") {
      setSourcingView("analysis");
      setWorkspace("sourcing");
    } else if (destination === "shipments") {
      setLogisticsView("shipments");
      setWorkspace("logistics");
    } else if (destination === "importcosts") {
      setLogisticsView("costs");
      setWorkspace("logistics");
    } else if (destination === "performance") {
      setSalesView("performance");
      setWorkspace("sales");
    } else if (destination === "sales") {
      setSalesView("orders");
      setWorkspace("sales");
    } else {
      setWorkspace(destination);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [title, subtitle] = pageMeta[workspace];

  return <div className="cg-app-shell">
    <header className="cg-topbar">
      <div className="cg-topbar-inner">
        <button className="cg-logo-button" onClick={() => navigate("dashboard")} aria-label="Costa Gear dashboard">
          <img className="cg-brand-logo" src="/costa-gear-logo.png" alt="Costa Gear Off-Road Accessories" />
        </button>

        <nav className="cg-primary-nav" aria-label="Costa Gear primary navigation">
          {primaryNav.map(({ id, label, Icon }) => <button key={id} className={`cg-nav-button ${workspace === id ? "active" : ""}`} onClick={() => navigate(id)}>
            <Icon size={18} strokeWidth={1.9} />
            <span>{label}</span>
          </button>)}
        </nav>
      </div>
    </header>

    <main className="cg-main-area">
      <div className="cg-page-header">
        <div>
          <div className="cg-page-eyebrow">Costa Gear Operations</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="cg-page-content">
        {workspace === "buying" && <WorkflowHandoffNotice handoff={handoff} onDismiss={() => setHandoff(null)} />}
        {workspace === "dashboard" ? <div className="cg-module-embedded"><OperationalDashboard onNavigate={navigate} /></div>
          : workspace === "sourcing" ? <SourcingWorkspace key={sourcingView} initialView={sourcingView} onNavigate={navigate} />
          : workspace === "buying" ? <div className="cg-module-embedded"><BuyingDecisionWorkspace /></div>
          : workspace === "logistics" ? <LogisticsWorkspace key={logisticsView} initialView={logisticsView} />
          : workspace === "receiving" ? <div className="cg-module-embedded"><ReceivingInventoryWorkspace /></div>
          : <CommercialWorkspace key={salesView} initialView={salesView} />}
      </div>
    </main>
  </div>;
}
