import { useEffect, useState } from "react";
import {
  ArchiveRestore,
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
import LegacyMigrationWorkspace from "./components/LegacyMigrationWorkspace";
import WorkflowHandoffNotice from "./components/WorkflowHandoffNotice";
import {
  connectMicrosoftOneDrive,
  getMicrosoftOneDriveAuthState,
  getMicrosoftOneDriveConfiguration,
} from "./services/microsoftOneDriveAuth";
import { testOneDriveConnection } from "./services/oneDriveAppFolderService";
import { initializeSharedOneDriveRepository } from "./services/sharedOneDriveRepositoryService";
import { syncOneDriveDocumentIndex } from "./services/oneDriveDocumentIndexService";
import "./brand.css";
import "./legacy-overrides.css";
import "./mobile.css";

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
  migration: ["Legacy Migration", "Review staged documents before moving them into the governed Costa Gear repository."],
};

function readSessionValue(key, fallback, allowedValues = null) {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return fallback;
    if (allowedValues && !allowedValues.includes(stored)) return fallback;
    return stored;
  } catch (_) {
    return fallback;
  }
}

function initialWorkspace() {
  if (typeof window === "undefined") return "dashboard";
  try {
    const pending = window.sessionStorage.getItem("cg:return-workspace");
    if (pending === "expenses") {
      window.sessionStorage.removeItem("cg:return-workspace");
      return "expenses";
    }
  } catch (_) {}
  return readSessionValue("cg:workspace", "dashboard", Object.keys(pageMeta));
}

export default function App() {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [sourcingView, setSourcingView] = useState(() => readSessionValue("cg:sourcing-view", "master", ["master", "analysis"]));
  const [logisticsView, setLogisticsView] = useState(() => readSessionValue("cg:logistics-view", "shipments", ["shipments", "costs"]));
  const [salesView, setSalesView] = useState(() => readSessionValue("cg:sales-view", "orders", ["orders", "performance", "planning", "pricing"]));
  const [handoff, setHandoff] = useState(null);
  const [oneDriveVersion, setOneDriveVersion] = useState(0);
  const [oneDriveBusy, setOneDriveBusy] = useState(false);
  const [oneDriveMessage, setOneDriveMessage] = useState("");
  const [oneDriveAuth, setOneDriveAuth] = useState(() => ({
    configured: getMicrosoftOneDriveConfiguration().configured,
    connected: false,
    needsConsent: false,
    username: null,
  }));

  useEffect(() => {
    try { window.sessionStorage.setItem("cg:workspace", workspace); } catch (_) {}
  }, [workspace]);

  useEffect(() => {
    try { window.sessionStorage.setItem("cg:sourcing-view", sourcingView); } catch (_) {}
  }, [sourcingView]);

  useEffect(() => {
    try { window.sessionStorage.setItem("cg:logistics-view", logisticsView); } catch (_) {}
  }, [logisticsView]);

  useEffect(() => {
    try { window.sessionStorage.setItem("cg:sales-view", salesView); } catch (_) {}
  }, [salesView]);

  const finalizeOneDriveConnection = async (state, activeCheck = () => true) => {
    const setup = await initializeSharedOneDriveRepository({ microsoftAccount: state?.username || null });
    if (!activeCheck()) return null;
    if (setup.pendingOwnerSetup) {
      return setup.message || "The shared Costa Gear repository still needs owner setup.";
    }

    const connection = await testOneDriveConnection();
    if (!activeCheck()) return null;
    let message = connection?.folderName
      ? `${connection.sharedRepository ? "Shared repository" : "OneDrive"}: ${connection.folderName}`
      : "OneDrive connected";

    const successfulShares = (setup.shared || []).filter(item => item.ok);
    const failedShares = (setup.shared || []).filter(item => !item.ok);
    if (successfulShares.length) message += ` · Shared with ${successfulShares.map(item => item.email).join(", ")}`;
    if (failedShares.length) message += ` · ${failedShares.length} collaborator invite needs attention`;

    try {
      const index = await syncOneDriveDocumentIndex();
      if (!activeCheck()) return null;
      message += ` · Index synced (${index.itemCount} items)`;
    } catch (_) {
      message += " · Index sync needs attention";
    }

    return message;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const state = await getMicrosoftOneDriveAuthState();
        if (!active) return;
        setOneDriveAuth(state);
        if (state.connected) {
          try {
            const message = await finalizeOneDriveConnection(state, () => active);
            if (!active || message === null) return;
            setOneDriveMessage(message);
            setOneDriveVersion((version) => version + 1);
          } catch (error) {
            if (active) setOneDriveMessage(error?.message || "OneDrive authorization needs attention.");
          }
        } else if (state.needsConsent) {
          setOneDriveMessage("OneDrive needs one-time permission renewal for the shared Costa Gear repository.");
        }
      } catch (_) {}
    })();
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
      if (authState?.redirecting) return;
      setOneDriveAuth(authState);
      const message = await finalizeOneDriveConnection(authState);
      if (message !== null) setOneDriveMessage(message);
      setOneDriveVersion((version) => version + 1);
    } catch (error) {
      setOneDriveMessage(error?.message || "Unable to connect OneDrive.");
    } finally {
      setOneDriveBusy(false);
    }
  };

  const [title, subtitle] = pageMeta[workspace];
  const showOneDriveControl = workspace === "expenses" || workspace === "migration";

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
          <button className={`cg-nav-button cg-nav-admin ${workspace === "expenses" || workspace === "migration" ? "active" : ""}`} onClick={() => navigate("expenses")} aria-label="Administrative module: Expenses">
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
                title="Microsoft Graph permission: Files.ReadWrite"
                style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
              >
                <Cloud size={15} />
                {oneDriveBusy
                  ? "Connecting..."
                  : !oneDriveAuth.configured
                    ? "OneDrive setup required"
                    : oneDriveAuth.connected
                      ? "Shared OneDrive connected"
                      : oneDriveAuth.needsConsent
                        ? "Reconnect OneDrive"
                        : "Connect OneDrive"}
              </button>
              {workspace === "expenses" ? (
                <button type="button" className="cg-text-button" onClick={() => navigate("migration")} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <ArchiveRestore size={14} />Legacy migration
                </button>
              ) : null}
              {oneDriveMessage ? <span style={{ fontSize: 10.5, color: "#687166", maxWidth: 360, textAlign: "right" }}>{oneDriveMessage}</span> : null}
              {oneDriveAuth.username ? <span style={{ fontSize: 10.5, color: "#687166" }}>{oneDriveAuth.username}</span> : null}
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
          : workspace === "migration" ? <LegacyMigrationWorkspace onBack={() => navigate("expenses")} />
          : <CommercialWorkspace key={salesView} initialView={salesView} onNavigate={navigate} />}
      </div>
    </main>
  </div>;
}
