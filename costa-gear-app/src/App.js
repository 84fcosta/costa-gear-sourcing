import { useState } from "react";
import BuyingDecisionWorkspace from "./components/BuyingDecisionWorkspace";
import ReceivingInventoryWorkspace from "./components/ReceivingInventoryWorkspace";
import OperationalDashboard from "./components/OperationalDashboard";
import SourcingWorkspace from "./components/SourcingWorkspace";
import LogisticsWorkspace from "./components/LogisticsWorkspace";

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

  return <div>
    <div style={{position:"sticky",top:0,zIndex:150,background:"rgba(243,244,239,.96)",backdropFilter:"blur(10px)",borderBottom:"1px solid rgba(50,56,42,.12)",padding:"9px 18px"}}>
      <div style={{maxWidth:1560,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
        <div style={{fontSize:12,color:"#647062"}}><strong style={{color:"#20251F"}}>Costa Gear</strong> · Source → Buy → Ship → Receive → Sell</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button style={navButton(workspace==="dashboard")} onClick={()=>navigate("dashboard")}>Dashboard</button>
          <button style={navButton(workspace==="sourcing")} onClick={()=>navigate("sourcing")}>Sourcing</button>
          <button style={navButton(workspace==="buying")} onClick={()=>navigate("buying")}>Buying</button>
          <button style={navButton(workspace==="logistics")} onClick={()=>navigate("logistics")}>Logistics</button>
          <button style={navButton(workspace==="receiving")} onClick={()=>navigate("receiving")}>Inventory</button>
        </div>
      </div>
    </div>
    {workspace==="dashboard" ? <OperationalDashboard onNavigate={navigate}/>
      : workspace==="sourcing" ? <SourcingWorkspace onNavigate={navigate}/>
      : workspace==="buying" ? <BuyingDecisionWorkspace handoff={handoff} onNavigate={navigate} onHandoffConsumed={()=>setHandoff(null)}/>
      : workspace==="logistics" ? <LogisticsWorkspace key={`${logisticsView}-${handoff?.purchaseOrderId||""}`} initialView={logisticsView} handoff={handoff} onHandoffConsumed={()=>setHandoff(null)}/>
      : <ReceivingInventoryWorkspace/>}
  </div>;
}
