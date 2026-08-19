import { useState } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  PackageSearch,
  ReceiptText,
  ShoppingCart,
  Tags,
  Truck,
  Warehouse,
} from "lucide-react";
import BuyingDecisionWorkspace from "./components/BuyingDecisionWorkspace";
import ReceivingInventoryWorkspace from "./components/ReceivingInventoryWorkspace";
import OperationalDashboard from "./components/OperationalDashboard";
import SourcingWorkspace from "./components/SourcingWorkspace";
import LogisticsWorkspace from "./components/LogisticsWorkspace";
import WorkflowHandoffNotice from "./components/WorkflowHandoffNotice";
import "./brand.css";

const primaryNav = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "sourcing", label: "Sourcing", Icon: PackageSearch },
  { id: "buying", label: "Buying", Icon: ShoppingCart },
  { id: "logistics", label: "Logistics", Icon: Truck },
  { id: "receiving", label: "Inventory", Icon: Boxes },
];

const pageMeta = {
  dashboard: ["Operational Dashboard", "One view of sourcing readiness, buying commitments, logistics, receiving and inventory."],
  sourcing: ["Sourcing", "Manage products, suppliers, quotations, RFQs and sourcing decisions in one workspace."],
  buying: ["Buying Decisions & Purchase Orders", "Convert approved sourcing decisions into planned and ordered purchases."],
  logistics: ["Logistics & Landed Cost", "Manage shipments, freight allocation, duty and import costs from one workflow."],
  receiving: ["Receiving & Inventory", "Receive against shipments, confirm exceptions and maintain on-hand inventory."],
};

function SidebarButton({ active, Icon, label, onClick }) {
  return <button className={`cg-side-link ${active ? "active" : ""}`} onClick={onClick}>
    <Icon size={17} strokeWidth={1.9} />
    <span>{label}</span>
  </button>;
}

export default function App() {
  const [workspace, setWorkspace] = useState("dashboard");
  const [sourcingView, setSourcingView] = useState("master");
  const [logisticsView, setLogisticsView] = useState("shipments");
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

    <div className="cg-layout">
      <aside className="cg-sidebar">
        <div className="cg-sidebar-scroll">
          <div className="cg-side-section">
            <SidebarButton active={workspace === "dashboard"} Icon={LayoutDashboard} label="Overview" onClick={() => navigate("dashboard")} />
          </div>

          <div className="cg-side-section">
            <div className="cg-side-label">Sourcing</div>
            <SidebarButton active={workspace === "sourcing" && sourcingView === "master"} Icon={Tags} label="Products & Quotes" onClick={() => navigate("operations")} />
            <SidebarButton active={workspace === "sourcing" && sourcingView === "analysis"} Icon={BarChart3} label="Decision Lab" onClick={() => navigate("intelligence")} />
          </div>

          <div className="cg-side-section">
            <div className="cg-side-label">Buying</div>
            <SidebarButton active={workspace === "buying"} Icon={ClipboardList} label="Buying Decisions" onClick={() => navigate("buying")} />
          </div>

          <div className="cg-side-section">
            <div className="cg-side-label">Logistics</div>
            <SidebarButton active={workspace === "logistics" && logisticsView === "shipments"} Icon={Truck} label="Shipments" onClick={() => navigate("shipments")} />
            <SidebarButton active={workspace === "logistics" && logisticsView === "costs"} Icon={FileSpreadsheet} label="Import Costs" onClick={() => navigate("importcosts")} />
          </div>

          <div className="cg-side-section">
            <div className="cg-side-label">Inventory</div>
            <SidebarButton active={workspace === "receiving"} Icon={ReceiptText} label="Receiving" onClick={() => navigate("receiving")} />
            <SidebarButton active={workspace === "receiving"} Icon={Warehouse} label="On-hand Inventory" onClick={() => navigate("receiving")} />
          </div>
        </div>

        <div className="cg-sidebar-footer">
          <div className="cg-sidebar-mark">CG</div>
          <div><strong>Costa Gear Co.</strong><span>Off-Road Accessories</span></div>
        </div>
      </aside>

      <section className="cg-main-area">
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
            : <div className="cg-module-embedded"><ReceivingInventoryWorkspace /></div>}
        </div>
      </section>
    </div>
  </div>;
}
