import { useState } from "react";
import LegacyApp from "../LegacyApp";
import SourcingDecisionLab from "./SourcingDecisionLab";

const tabStyle = active => ({
  border: active ? "1px solid rgba(116,123,49,.72)" : "1px solid rgba(50,56,42,.12)",
  background: active ? "#747B31" : "#fff",
  color: active ? "#fff" : "#20251F",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer"
});

export default function SourcingWorkspace({ onNavigate }) {
  const [view, setView] = useState("master");
  return <div>
    <div style={{background:"#F3F4EF",borderBottom:"1px solid rgba(50,56,42,.10)",padding:"14px 18px"}}>
      <div style={{maxWidth:1560,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:18,fontWeight:850,color:"#20251F"}}>Sourcing</div>
          <div style={{fontSize:12,color:"#647062",marginTop:2}}>Products, suppliers, quotes, RFQs and sourcing analysis in one workflow.</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button style={tabStyle(view==="master")} onClick={()=>setView("master")}>Products & Quotes</button>
          <button style={tabStyle(view==="analysis")} onClick={()=>setView("analysis")}>Decision Lab</button>
        </div>
      </div>
    </div>
    {view==="master" ? <LegacyApp/> : <SourcingDecisionLab onNavigate={onNavigate}/>} 
  </div>;
}
