import { useEffect, useState } from "react";
import DemandPlanningWorkspace from "./DemandPlanningWorkspace";
import MobileDemandPlanningWorkspace from "./MobileDemandPlanningWorkspace";

export default function ResponsiveDemandPlanningWorkspace({onNavigate}){
  const [mobile,setMobile]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(max-width: 680px)").matches);
  useEffect(()=>{const mq=window.matchMedia("(max-width: 680px)");const onChange=()=>setMobile(mq.matches);onChange();mq.addEventListener?.("change",onChange);return()=>mq.removeEventListener?.("change",onChange);},[]);
  return mobile?<MobileDemandPlanningWorkspace onNavigate={onNavigate}/>:<DemandPlanningWorkspace onNavigate={onNavigate}/>;
}
