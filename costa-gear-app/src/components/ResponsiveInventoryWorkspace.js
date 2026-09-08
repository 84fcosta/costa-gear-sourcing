import { useEffect, useState } from "react";
import ReceivingInventoryWorkspace from "./ReceivingInventoryWorkspace";
import MobileInventoryWorkspace from "./MobileInventoryWorkspace";

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

export default function ResponsiveInventoryWorkspace() {
  return useMobileBreakpoint() ? <MobileInventoryWorkspace /> : <ReceivingInventoryWorkspace />;
}
