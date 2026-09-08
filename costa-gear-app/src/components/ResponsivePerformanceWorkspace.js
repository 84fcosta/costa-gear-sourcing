import { useEffect, useState } from "react";
import PerformanceWorkspace from "./PerformanceWorkspace";
import MobilePerformanceWorkspace from "./MobilePerformanceWorkspace";

export default function ResponsivePerformanceWorkspace(){
  const [mobile,setMobile]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(max-width: 680px)").matches);
  useEffect(()=>{const mq=window.matchMedia("(max-width: 680px)");const onChange=()=>setMobile(mq.matches);onChange();mq.addEventListener?.("change",onChange);return()=>mq.removeEventListener?.("change",onChange);},[]);
  return mobile?<MobilePerformanceWorkspace/>:<PerformanceWorkspace/>;
}
