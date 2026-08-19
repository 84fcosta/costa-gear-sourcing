import { useState } from "react";
import ShipmentAllocationWorkspace from "./ShipmentAllocationWorkspace";
import ImportCostWorkspace from "./ImportCostWorkspace";

const tabStyle = active => ({
  border: active ? "1px solid rgba(116,123,49,.72)" : "1px solid rgba(50,56,42,.12)",
  background: active ? "#747B31" : "#fff",
  color: active ? "#fff" : "#20251F",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer"
});

export default function LogisticsWorkspace({ initialView="shipments" }) {
  const [view, setView] = useState(initialView);
  return <div>
    <div style={{background:"#F3F4EF",borderBottom:"1px solid rgba(50,56,42,.10)",padding:"14px 18px"}}>
      <div style={{maxWidth:1560,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:18,fontWeight:850,color:"#20251F"}}>Logistics & Landed Cost</div>
          <div style={{fontSize:12,color:"#647062",marginTop:2}}>Manage shipments first, then allocate freight, duty and import costs to the products received.</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button style={tabStyle(view==="shipments")} onClick={()=>setView("shipments")}>Shipments</button>
          <button style={tabStyle(view==="costs")} onClick={()=>setView("costs")}>Import Costs</button>
        </div>
      </div>
    </div>
    {view==="shipments" ? <ShipmentAllocationWorkspace/> : <ImportCostWorkspace/>}
  </div>;
}
