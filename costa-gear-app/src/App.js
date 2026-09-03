import { useEffect, useState } from "react";
import {
  Boxes,
  Cloud,
  DollarSign,
  LayoutDashboard,
  PackageSearch,
  ReceiptText,
  ShoppingCart,
  Truck,
} from "lucide-react";
import BuyingDecisionWorkspace from "./components/BuyingDecisionWorkspace";
import ReceivingInventoryWorkspace from "./components/ReceivingInventoryWorkspace";
import OperationalDashboard from "./components/OperationalDashboard";
import SourcingWorkspace from "./components/SourcingWorkspace";
import LogisticsWorkspace from "./components/LogisticsWorkspace";
import CommercialWorkspace from "./components/CommercialWorkspace";
import ExpenseWorkspace from "./components/ExpenseWorkspace";
import WorkflowHandoffNotice from "./components/WorkflowHandoffNotice";
import {
  connectMicrosoftOneDrive,
  getMicrosoftOneDriveAuthState,
  getMicrosoftOneDriveConfiguration,
} from "./services/microsoftOneDriveAuth";
import { testOneDriveConnection } from "./services/oneDriveAppFolderService";
import "./brand.css";
import "./legacy-overrides.css";

const primaryNav = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "sourcing", label: "Sourcing", step: 1, Icon: PackageSearch },
  { id: "buying", label: "Buying", step: 2, Icon: ShoppingCart },
  { id: "logistics", label: "Logistics", step: 3, Icon: Truck },
  { id: "receiving", label: "Inventory", step: 4, Icon: Boxes },
  { id: "sales", label: "Sales", step: 5, Icon: DollarSign },
];

const pageMeta = {
  dashboard: ["Business Dashboard", "See sales, profit, inventory health and the few actions that need attention."],
  sourcing: ["Sourcing", "Step 1 · Products, suppliers, quotations and sourcing decisions."],
  buying: ["Buying Decisions & Purchase Orders", "Step 2 · Convert sourcing decisions into planned and ordered purchases."],
  logistics: ["Logistics & Landed Cost", "Step 3 · Shipments, freight allocation, duty and import costs."],
  receiving: ["Receiving & Inventory", "Step 4 · Receive goods, confirm exceptions and make sellable stock available."],
  sales: ["Sales", "Step 5 · Record sales and measure realized revenue, profit and margin."],
  expenses: ["Expenses", "Administrative module for business expenses, receipts, assets and tax reporting."],
};

export default function App() {
  const [workspace, setWorkspace] = useState("dashboard");
  const [sourcingView, setSourcingView] = useState("master");
  const [logisticsView, setLogisticsView] = useState("shipments");
  const [salesView, setSalesView] = useState("orders");
  const [handoff, setHandoff] = useState(null);
  const [oneDriveVersion, setOneDriveVersion] = useState(0);
  const [oneDriveBusy, setOneDriveBusy] = useState(false);
  const [oneDriveMessage, setOneDriveMessage] = useState("");
  const [oneDriveAuth, setOneDriveAuth] = useState(() => ({
    configured: getMicrosoftOneDriveConfiguration().configured,
    connected: false,
    username: null,
  }));

  useEffect(() => {
    let active = true;
    getMicrosoftOneDriveAuthState()
      .then((state) => { if (active) setOneDriveAuth(state); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

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
    } else if (destination === "planning") {
      setSalesView("planning");
      setWorkspace("sales");
    } else if (destination === "pricing") {
      setSalesView("pricing");
      setWorkspace("sales");
    } else if (destination === "sales") {
      setSalesView("orders");
      setWorkspace("sales");
    } else {
      setWorkspace(destination);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const connectOneDrive = async () => {
    setOneDriveBusy(true);
    setOneDriveMessage("");
    try {
      const authState = await connectMicrosoftOneDrive();
      const connection = await testOneDriveConnection();
      setOneDriveAuth(authState);
      setOneDriveMessage(connection?.folderName ? `Connected to ${connection.folderName}` : "OneDrive connected");
      setOneDriveVersion((version) => version + 1);
    } catch (error) {
      setOneDriveMessage(error?.message || "Unable to connect OneDrive.");
    } finally {
      setOneDriveBusy(false);
    }
  };

  const [title, subtitle] = pageMeta[workspace];
  const showOneDriveControl = workspace === "expenses";

  return <div className="cg-app-shell">
    <header className="cg-topbar" style={{ height: 96 }}>
      <div className="cg-topbar-inner">
        <button className="cg-logo-button" onClick={() => navigate("dashboard")} aria-label="Costa Gear dashboard">
          <img className="cg-brand-logo" src="/costa-gear-logo-header.svg" alt="Costa Gear" style={{ width: 165, maxHeight: 88 }} />
        </button>

        <nav className="cg-primary-nav" aria-label="Costa Gear navigation">
          {primaryNav.map(({ id, label, step, Icon }) => <button key={id} className={`cg-nav-button ${workspace === id ? "active" : ""}`} onClick={() => navigate(id)} aria-label={step ? `Step ${step}: ${label}` : label}>
            <Icon size={18} strokeWidth={1.9} />
            <span className="cg-nav-label">{step && <b className="cg-nav-step">{step}</b>}<span>{label}</span></span>
          </button>)}
          <span className="cg-nav-divider" aria-hidden="true" />
          <button className={`cg-nav-button cg-nav-admin ${workspace === "expenses" ? "active" : ""}`} onClick={() => navigate("expenses")} aria-label="Administrative module: Expenses">
            <ReceiptText size={18} strokeWidth={1.9} />
            <span className="cg-nav-label"><span>Expenses</span></span>
          </button>
        </nav>
      </div>
    </header>

    <main className="cg-main-area" style={{ minHeight: "calc(100vh - 96px)" }}>
      <div className="cg-page-header">
        <div style={showOneDriveControl ? { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 } : undefined}>
          <div>
            <div className="cg-page-eyebrow">Costa Gear Operations</div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {showOneDriveControl ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
              <button
                type="button"
                className="cg-text-button"
                onClick={connectOneDrive}
                disabled={!oneDriveAuth.configured || oneDriveBusy || oneDriveAuth.connected}
                title="Microsoft Graph permission: Files.ReadWrite.AppFolder"
                style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
              >
                <Cloud size={15} />
                {oneDriveBusy
                  ? "Connecting..."
                  : !oneDriveAuth.configured
                    ? "OneDrive setup required"
                    : oneDriveAuth.connected
                      ? "OneDrive connected"
                      : "Connect OneDrive"}
              </button>
              {oneDriveMessage ? <span style={{ fontSize: 10.5, color: "#687166", maxWidth: 300, textAlign: "right" }}>{oneDriveMessage}</span> : null}
              {oneDriveAuth.connected && oneDriveAuth.username ? <span style={{ fontSize: 10.5, color: "#687166" }}>{oneDriveAuth.username}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="cg-page-content">
        {workspace === "buying" && <WorkflowHandoffNotice handoff={handoff} onDismiss={() => setHandoff(null)} />}
        {workspace === "dashboard" ? <div className="cg-module-embedded cg-dashboard-embedded"><OperationalDashboard onNavigate={navigate} /></div>
          : workspace === "sourcing" ? <SourcingWorkspace key={sourcingView} initialView={sourcingView} onNavigate={navigate} />
          : workspace === "buying" ? <div className="cg-module-embedded"><BuyingDecisionWorkspace /></div>
          : workspace === "logistics" ? <LogisticsWorkspace key={logisticsView} initialView={logisticsView} />
          : workspace === "receiving" ? <div className="cg-module-embedded"><ReceivingInventoryWorkspace /></div>
          : workspace === "expenses" ? <ExpenseWorkspace key={oneDriveVersion} />
          : <CommercialWorkspace key={salesView} initialView={salesView} onNavigate={navigate} />}
      </div>
    </main>
  </div>;
}
