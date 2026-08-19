import { useState } from "react";
import LegacyApp from "./LegacyApp";
import SourcingIntelligencePanel from "./components/SourcingIntelligencePanel";
import SourcingDecisionLab from "./components/SourcingDecisionLab";
import ShipmentAllocationWorkspace from "./components/ShipmentAllocationWorkspace";

const navButton = (active) => ({
  border: active ? "1px solid rgba(116,123,49,.7)" : "1px solid rgba(50,56,42,.12)",
  background: active ? "linear-gradient(180deg,#929A44,#747B31)" : "#fff",
  color: active ? "#fff" : "#20251F",
  borderRadius: 10,
  padding: "9px 13px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
});

export default function App() {
  const [workspace, setWorkspace] = useState("operations");

  return (
    <div>
      <div style={{ position: "sticky", top: 0, zIndex: 150, background: "rgba(243,244,239,.96)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(50,56,42,.12)", padding: "9px 18px" }}>
        <div style={{ maxWidth: 1560, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "#647062" }}><strong style={{ color: "#20251F" }}>Costa Gear Sourcing</strong> · Operations, logistics and decision support</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={navButton(workspace === "operations")} onClick={() => setWorkspace("operations")}>Operations</button>
            <button style={navButton(workspace === "shipments")} onClick={() => setWorkspace("shipments")}>Shipments</button>
            <button style={navButton(workspace === "intelligence")} onClick={() => setWorkspace("intelligence")}>Sourcing Intelligence</button>
          </div>
        </div>
      </div>

      {workspace === "operations" ? (
        <>
          <LegacyApp />
          <SourcingIntelligencePanel />
        </>
      ) : workspace === "shipments" ? (
        <ShipmentAllocationWorkspace />
      ) : (
        <SourcingDecisionLab />
      )}
    </div>
  );
}
