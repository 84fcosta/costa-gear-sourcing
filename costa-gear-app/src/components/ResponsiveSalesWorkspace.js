import { useEffect, useState } from "react";
import SalesWorkspace from "./SalesWorkspace";
import MobileSalesWorkspace from "./MobileSalesWorkspace";

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

export default function ResponsiveSalesWorkspace() {
  return useMobileBreakpoint() ? <MobileSalesWorkspace /> : <SalesWorkspace />;
}
