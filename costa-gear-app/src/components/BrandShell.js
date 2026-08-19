import { BarChart3, Boxes, PackageCheck, ShoppingCart, Truck } from "lucide-react";

const items = [
  ["dashboard", "Dashboard", BarChart3],
  ["sourcing", "Sourcing", Boxes],
  ["buying", "Buying", ShoppingCart],
  ["logistics", "Logistics", Truck],
  ["receiving", "Inventory", PackageCheck],
];

export default function BrandShell({ active, onNavigate, children }) {
  return <div className="cg-app-shell">
    <header className="cg-topbar">
      <div className="cg-topbar-inner">
        <button className="cg-logo-button" onClick={() => onNavigate("dashboard")} aria-label="Costa Gear dashboard">
          <img className="cg-brand-logo" src="/costa-gear-logo.png" alt="Costa Gear" />
        </button>
        <nav className="cg-primary-nav-inline" aria-label="Primary navigation">
          {items.map(([key,label,Icon]) => <button key={key} className={`cg-nav-button ${active===key?"active":""}`} onClick={()=>onNavigate(key)}>
            <Icon size={18} strokeWidth={1.8}/><span>{label}</span>
          </button>)}
        </nav>
      </div>
    </header>
    <main className="cg-workspace">{children}</main>
  </div>;
}
