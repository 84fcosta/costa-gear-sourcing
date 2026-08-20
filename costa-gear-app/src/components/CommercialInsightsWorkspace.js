import { useEffect, useState } from "react";
import PerformanceWorkspace from "./PerformanceWorkspace";
import DemandPlanningWorkspace from "./DemandPlanningWorkspace";
import PricingIntelligenceWorkspace from "./PricingIntelligenceWorkspace";

const tools = [
  { id: "performance", title: "Inventory & Profit", copy: "See aging, sell-through, realized margin and slow-moving stock when you need a deeper review." },
  { id: "planning", title: "Reorder", copy: "Use sales velocity, stock and lead time to decide when and how much to buy again." },
  { id: "pricing", title: "Pricing", copy: "Review margin, market references and aging before changing a target selling price." },
];

const cardStyle = { background: "#fff", border: "1px solid rgba(50,56,42,.12)", borderRadius: 14, padding: 18, textAlign: "left", display: "grid", gap: 8 };

export default function CommercialInsightsWorkspace({ initialInsight="overview", onNavigate }) {
  const [view,setView]=useState(initialInsight || "overview");
  useEffect(()=>setView(initialInsight || "overview"),[initialInsight]);

  if(view!=="overview") {
    const title=tools.find(tool=>tool.id===view)?.title || "Business Insights";
    return <div style={{display:"grid",gap:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:11,fontWeight:850,letterSpacing:.6,textTransform:"uppercase",color:"#747B31"}}>Business Insights</div>
          <div style={{fontSize:20,fontWeight:850,color:"#20251F",marginTop:2}}>{title}</div>
        </div>
        <button className="cg-secondary-button" onClick={()=>setView("overview")}>Back to Insights</button>
      </div>
      {view==="performance"?<PerformanceWorkspace/>:view==="planning"?<DemandPlanningWorkspace onNavigate={onNavigate}/>:<PricingIntelligenceWorkspace/>}
    </div>;
  }

  return <div style={{display:"grid",gap:16}}>
    <div style={{background:"#F7F8F3",border:"1px solid rgba(50,56,42,.12)",borderRadius:14,padding:16}}>
      <div style={{fontSize:17,fontWeight:850,color:"#20251F"}}>Use these only when they help a decision</div>
      <div style={{fontSize:12.5,color:"#647062",marginTop:5,lineHeight:1.55,maxWidth:820}}>Day-to-day work stays in the main Costa Gear workflow. These tools are optional decision support for inventory, reordering and pricing, so they do not need to be part of every transaction.</div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
      {tools.map(tool=><div key={tool.id} style={cardStyle}>
        <div style={{fontSize:16,fontWeight:850,color:"#20251F"}}>{tool.title}</div>
        <div style={{fontSize:12.5,color:"#647062",lineHeight:1.55,minHeight:58}}>{tool.copy}</div>
        <div><button className="cg-primary-button" onClick={()=>setView(tool.id)}>Open</button></div>
      </div>)}
    </div>
  </div>;
}
