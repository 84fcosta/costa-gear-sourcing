import { useEffect, useState } from "react";
import {
  Boxes,
  Cloud,
  DollarSign,
  Download,
  Home,
  LayoutDashboard,
  Menu,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Truck,
} from "lucide-react";
import BuyingDecisionWorkspace from "./components/BuyingDecisionWorkspace";
import ReceivingInventoryWorkspace from "./components/ResponsiveInventoryWorkspace";
import OperationalDashboard from "./components/OperationalDashboard";
import MobileDashboard from "./components/MobileDashboard";
import MobileProductCatalog from "./components/MobileProductCatalog";
import MobileQuickSale from "./components/MobileQuickSale";
import MobileExpenseWorkspace from "./components/MobileExpenseWorkspace";
import SourcingWorkspace from "./components/SourcingWorkspace";
import LogisticsWorkspace from "./components/LogisticsWorkspace";
import CommercialWorkspace from "./components/CommercialWorkspace";
import ExpenseWorkspace from "./components/ExpenseWorkspace";
import DocumentGovernanceWorkspace from "./components/DocumentGovernanceWorkspace";
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
  products: ["Products", "Fast product lookup with stock, photos, cost and selling price."],
  sell: ["Quick Sale", "Record a sale with live inventory and landed-cost margin."],
  sourcing: ["Sourcing", "Step 1 · Products, suppliers, quotations and sourcing decisions."],
  buying: ["Buying Decisions & Purchase Orders", "Step 2 · Convert sourcing decisions into planned and ordered purchases."],
  logistics: ["Logistics & Landed Cost", "Step 3 · Shipments, freight allocation, duty and import costs."],
  receiving: ["Receiving & Inventory", "Step 4 · Receive goods, confirm exceptions and make sellable stock available."],
  sales: ["Sales", "Step 5 · Record sales and measure realized revenue, profit and margin."],
  expenses: ["Expenses", "Administrative module for business expenses, receipts, assets and tax reporting."],
  governance: ["Document Governance", "Monitor active document compliance and repository health."],
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
    const requested = new URLSearchParams(window.location.search).get("workspace");
    if (requested && Object.prototype.hasOwnProperty.call(pageMeta, requested)) return requested;
    const pending = window.sessionStorage.getItem("cg:return-workspace");
    if (pending === "expenses") {
      window.sessionStorage.removeItem("cg:return-workspace");
      return "expenses";
    }
  } catch (_) {}
  const stored = readSessionValue("cg:workspace", "dashboard", [...Object.keys(pageMeta), "migration"]);
  return stored === "migration" ? "governance" : stored;
}

function useMobileBreakpoint() {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 680px)").matches);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const query = window.matchMedia("(max-width: 680px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return mobile;
}

export default function App() {
  const mobile = useMobileBreakpoint();
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [sourcingView, setSourcingView] = useState(() => {
    const stored = readSessionValue("cg:sourcing-view", "master", ["intake", "master", "quotations", "analysis"]);
    return stored === "intake" ? "master" : stored;
  });
  const [logisticsView, setLogisticsView] = useState(() => readSessionValue("cg:logistics-view", "shipments", ["shipments", "costs"]));
  const [salesView, setSalesView] = useState(() => readSessionValue("cg:sales-view", "orders", ["orders", "performance", "planning", "pricing"]));
  const [handoff, setHandoff] = useState(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileOverlay, setMobileOverlay] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
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
    const captureInstallPrompt = event => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  useEffect(() => {
    try { window.sessionStorage.setItem("cg:workspace", workspace); } catch (_) {}
  }, [workspace]);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("workspace")) {
        url.searchParams.delete("workspace");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    try { window.sessionStorage.setItem("cg:sourcing-view", sourcingView); } catch (_) {}
  }, [sourcingView]);

  useEffect(() => {
    try { window.sessionStorage.setItem("cg:logistics-view", logisticsView); } catch (_) {}
  }, [logisticsView]);

  useEffect(() => {
    try { window.sessionStorage.setItem("cg:sales-view", salesView); } catch (_) {}
  }, [salesView]);

  useEffect(() => {
    if (!mobile || typeof window === "undefined") {
      setMobileOverlay(null);
      setMobileMoreOpen(false);
      return undefined;
    }

    const previousScrollRestoration = window.history.scrollRestoration;
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";

    const restoreRoute = (state, restoreScroll = true) => {
      if (!state?.cgMobile) return;
      setWorkspace(state.workspace || "dashboard");
      setSourcingView(state.sourcingView || "master");
      setLogisticsView(state.logisticsView || "shipments");
      setSalesView(state.salesView || "orders");
      setHandoff(state.context || null);
      setMobileOverlay(state.overlay || null);
      setMobileMoreOpen(state.overlay?.type === "more");

      if (restoreScroll) {
        const top = Number(state.scrollY || 0);
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => window.scrollTo({ top, behavior: "auto" }));
        });
      }
    };

    const currentState = window.history.state;
    if (!currentState?.cgMobile) {
      const currentRoute = {
        cgMobile: true,
        root: workspace === "dashboard" && !handoff,
        workspace,
        sourcingView,
        logisticsView,
        salesView,
        context: handoff || null,
        overlay: null,
        scrollY: 0,
      };
      const rootRoute = {
        ...currentRoute,
        root: true,
        workspace: "dashboard",
        context: null,
        overlay: null,
        scrollY: 0,
      };

      if (workspace === "dashboard" && !handoff) {
        window.history.replaceState(rootRoute, "");
      } else {
        window.history.replaceState(rootRoute, "");
        window.history.pushState({ ...currentRoute, root: false }, "");
      }
    } else {
      restoreRoute(currentState, false);
    }

    const handlePopState = event => {
      if (!event.state?.cgMobile) return;
      restoreRoute(event.state, true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if ("scrollRestoration" in window.history) window.history.scrollRestoration = previousScrollRestoration;
    };
  }, [mobile]);

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

  const resolveDestination = destination => {
    let nextWorkspace = destination;
    let nextSourcingView = sourcingView;
    let nextLogisticsView = logisticsView;
    let nextSalesView = salesView;

    if (destination === "operations") {
      nextWorkspace = "sourcing";
      nextSourcingView = "master";
    } else if (destination === "intelligence") {
      nextWorkspace = "sourcing";
      nextSourcingView = "analysis";
    } else if (destination === "shipments") {
      nextWorkspace = "logistics";
      nextLogisticsView = "shipments";
    } else if (destination === "importcosts") {
      nextWorkspace = "logistics";
      nextLogisticsView = "costs";
    } else if (destination === "performance") {
      nextWorkspace = "sales";
      nextSalesView = "performance";
    } else if (destination === "planning") {
      nextWorkspace = "sales";
      nextSalesView = "planning";
    } else if (destination === "pricing") {
      nextWorkspace = "sales";
      nextSalesView = "pricing";
    } else if (destination === "sales") {
      nextWorkspace = "sales";
      nextSalesView = "orders";
    } else if (destination === "migration") {
      nextWorkspace = "governance";
    }

    return { nextWorkspace, nextSourcingView, nextLogisticsView, nextSalesView };
  };

  const applyRoute = ({ nextWorkspace, nextSourcingView, nextLogisticsView, nextSalesView, context = null, overlay = null }) => {
    setWorkspace(nextWorkspace);
    setSourcingView(nextSourcingView);
    setLogisticsView(nextLogisticsView);
    setSalesView(nextSalesView);
    setHandoff(context || null);
    setMobileOverlay(overlay);
    setMobileMoreOpen(overlay?.type === "more");
  };

  const navigate = (destination, context = null) => {
    const resolved = resolveDestination(destination);

    if (mobile && typeof window !== "undefined") {
      const current = window.history.state;
      const nextContext = context || null;
      const nextState = {
        cgMobile: true,
        root: false,
        workspace: resolved.nextWorkspace,
        sourcingView: resolved.nextSourcingView,
        logisticsView: resolved.nextLogisticsView,
        salesView: resolved.nextSalesView,
        context: nextContext,
        overlay: null,
        scrollY: 0,
      };

      if (current?.cgMobile) {
        window.history.replaceState({ ...current, scrollY: window.scrollY }, "");
      }

      const sameRoute = current?.cgMobile
        && !current.overlay
        && current.workspace === nextState.workspace
        && current.sourcingView === nextState.sourcingView
        && current.logisticsView === nextState.logisticsView
        && current.salesView === nextState.salesView
        && JSON.stringify(current.context || null) === JSON.stringify(nextContext);

      if (sameRoute) {
        applyRoute({ ...resolved, context: nextContext, overlay: null });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const replaceOverlayEntry = current?.cgMobile && current.overlay?.type === "more";
      if (replaceOverlayEntry) window.history.replaceState(nextState, "");
      else window.history.pushState(nextState, "");

      applyRoute({ ...resolved, context: nextContext, overlay: null });
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    setMobileMoreOpen(false);
    setMobileOverlay(null);
    if (context) setHandoff(context);
    else if (destination === "products" || destination === "sell") setHandoff(null);
    setSourcingView(resolved.nextSourcingView);
    setLogisticsView(resolved.nextLogisticsView);
    setSalesView(resolved.nextSalesView);
    setWorkspace(resolved.nextWorkspace);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openMobileOverlay = (type, payload = {}) => {
    if (!mobile || typeof window === "undefined") return;
    const current = window.history.state;
    if (!current?.cgMobile) return;
    if (current.overlay?.type === type) return;

    window.history.replaceState({ ...current, scrollY: window.scrollY }, "");
    const overlay = { type, ...payload };
    window.history.pushState({ ...current, root: false, overlay, scrollY: window.scrollY }, "");
    setMobileOverlay(overlay);
    setMobileMoreOpen(type === "more");
  };

  const closeMobileOverlay = () => {
    if (mobile && window.history.state?.cgMobile && window.history.state?.overlay) {
      window.history.back();
      return;
    }
    setMobileOverlay(null);
    setMobileMoreOpen(false);
  };

  const mobileBack = () => {
    if (mobile && window.history.state?.cgMobile) {
      window.history.back();
      return;
    }
    navigate("dashboard");
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

  const installMobileApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
    closeMobileOverlay();
  };

  const [title, subtitle] = pageMeta[workspace] || pageMeta.dashboard;
  const showOneDriveControl = workspace === "expenses" || workspace === "governance";
  const mobileMoreActive = !["dashboard", "products", "sell", "expenses"].includes(workspace);

  return <div className={`cg-app-shell ${mobile ? "cg-mobile-focused" : ""}`}>
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
          <span className="cg-nav-divider" aria-hidden="true" />
          <button className={`cg-nav-button cg-nav-admin ${workspace === "governance" ? "active" : ""}`} onClick={() => navigate("governance")} aria-label="Document Governance module">
            <ShieldCheck size={18} strokeWidth={1.9} />
            <span className="cg-nav-label"><span>Governance</span></span>
          </button>
        </nav>
      </div>
    </header>

    <main className="cg-main-area" style={{ minHeight: "calc(100vh - 96px)" }}>
      <div className="cg-page-header">
        <div className={showOneDriveControl ? "cg-page-header-with-actions" : ""} style={showOneDriveControl ? { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 } : undefined}>
          <div>
            <div className="cg-page-eyebrow">Costa Gear Operations</div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {showOneDriveControl ? (
            <div className="cg-page-header-actions" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
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
                      ? "Shared OneDrive connected"
                      : oneDriveAuth.needsConsent
                        ? "Reconnect OneDrive"
                        : "Connect OneDrive"}
              </button>
              {oneDriveMessage ? <span className="cg-page-header-action-message" style={{ fontSize: 10.5, color: "#687166", maxWidth: 360, textAlign: "right" }}>{oneDriveMessage}</span> : null}
              {oneDriveAuth.username ? <span className="cg-page-header-action-account" style={{ fontSize: 10.5, color: "#687166" }}>{oneDriveAuth.username}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="cg-page-content">
        {workspace === "buying" && <WorkflowHandoffNotice handoff={handoff} onDismiss={() => setHandoff(null)} />}
        {workspace === "dashboard" ? (mobile ? <MobileDashboard onNavigate={navigate} /> : <div className="cg-module-embedded cg-dashboard-embedded"><OperationalDashboard onNavigate={navigate} /></div>)
          : workspace === "products" ? (mobile ? <MobileProductCatalog initialProductId={handoff?.productId || null} mobileOverlay={mobileOverlay} onNavigate={navigate} onBack={mobileBack} onOpenOverlay={openMobileOverlay} onCloseOverlay={closeMobileOverlay} /> : <SourcingWorkspace initialView="master" onNavigate={navigate} />)
          : workspace === "sell" ? (mobile ? <MobileQuickSale initialProductId={handoff?.productId || null} onNavigate={navigate} /> : <CommercialWorkspace initialView="orders" onNavigate={navigate} />)
          : workspace === "sourcing" ? <SourcingWorkspace key={sourcingView} initialView={sourcingView} onNavigate={navigate} />
          : workspace === "buying" ? <div className="cg-module-embedded"><BuyingDecisionWorkspace /></div>
          : workspace === "logistics" ? <LogisticsWorkspace key={logisticsView} initialView={logisticsView} />
          : workspace === "receiving" ? <div className="cg-module-embedded"><ReceivingInventoryWorkspace /></div>
          : workspace === "expenses" ? (mobile ? <MobileExpenseWorkspace key={oneDriveVersion} onConnectOneDrive={connectOneDrive} oneDriveAuth={oneDriveAuth} oneDriveBusy={oneDriveBusy} /> : <ExpenseWorkspace key={oneDriveVersion} />)
          : workspace === "governance" ? <DocumentGovernanceWorkspace />
          : <CommercialWorkspace key={salesView} initialView={salesView} onNavigate={navigate} />}
      </div>
    </main>

    <nav className="cg-mobile-bottom-nav" aria-label="Mobile navigation">
      <button className={workspace === "dashboard" ? "active" : ""} onClick={() => navigate("dashboard")}><Home size={21}/><span>Home</span></button>
      <button className={workspace === "products" ? "active" : ""} onClick={() => navigate("products")}><PackageSearch size={21}/><span>Products</span></button>
      <button className={workspace === "sell" ? "active" : ""} onClick={() => navigate("sell")}><ShoppingBag size={21}/><span>Sell</span></button>
      <button className={workspace === "expenses" ? "active" : ""} onClick={() => navigate("expenses")}><ReceiptText size={21}/><span>Expenses</span></button>
      <button className={mobileMoreActive || mobileMoreOpen ? "active" : ""} onClick={() => openMobileOverlay("more")} aria-expanded={mobileMoreOpen}><Menu size={21}/><span>More</span></button>
    </nav>

    {mobileMoreOpen ? <div className="cg-mobile-more-backdrop" onClick={closeMobileOverlay}>
      <section className="cg-mobile-more-sheet" role="dialog" aria-modal="true" aria-label="More Costa Gear modules" onClick={event => event.stopPropagation()}>
        <div className="cg-mobile-sheet-handle" aria-hidden="true"/>
        <div className="cg-mobile-sheet-head"><div><strong>More</strong><span>Operations and administration</span></div><button onClick={closeMobileOverlay}>Close</button></div>
        <div className="cg-mobile-sheet-links">
          <button className={workspace === "receiving" ? "active" : ""} onClick={() => navigate("receiving")}><Boxes size={22}/><span><strong>Inventory & Receiving</strong><small>Stock position and incoming goods</small></span></button>
          <button className={workspace === "sales" ? "active" : ""} onClick={() => navigate("sales")}><DollarSign size={22}/><span><strong>Sales History</strong><small>Review and edit sales records</small></span></button>
          <button className={workspace === "sourcing" ? "active" : ""} onClick={() => navigate("sourcing")}><PackageSearch size={22}/><span><strong>Sourcing</strong><small>Products, suppliers and quotations</small></span></button>
          <button className={workspace === "buying" ? "active" : ""} onClick={() => navigate("buying")}><ShoppingCart size={22}/><span><strong>Buying</strong><small>Purchase decisions and POs</small></span></button>
          <button className={workspace === "logistics" ? "active" : ""} onClick={() => navigate("logistics")}><Truck size={22}/><span><strong>Logistics</strong><small>Shipments and landed cost</small></span></button>
          <button className={workspace === "governance" ? "active" : ""} onClick={() => navigate("governance")}><ShieldCheck size={22}/><span><strong>Document Governance</strong><small>Repository compliance and naming</small></span></button>
          {installPrompt ? <button onClick={installMobileApp}><Download size={22}/><span><strong>Install Costa Gear</strong><small>Add the app to this Android device</small></span></button> : null}
        </div>
      </section>
    </div> : null}
  </div>;
}