import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { supabase } from "../supabase";
import {
  buildProductFitmentMap,
  modelYearOptions,
  productMatchesStructuredFitment,
  vehicleModelOptions,
} from "../domain/structuredFitmentFilter";
import "../desktop-sourcing-overrides.css";

const normalize = value => String(value || "").trim().toLowerCase();
const DESKTOP_STICKY_BREAKPOINT = 1180;

function topbarHeight() {
  const topbar = document.querySelector(".cg-topbar");
  return Math.round(topbar?.getBoundingClientRect?.().height || 96);
}

function applyStickyStack(host, table) {
  if (!host || !table) return;
  const sticky = window.innerWidth >= DESKTOP_STICKY_BREAKPOINT;
  const top = topbarHeight();

  Object.assign(host.style, {
    position: sticky ? "sticky" : "relative",
    top: sticky ? `${top}px` : "auto",
    zIndex: "20",
    background: sticky ? "#fff" : "transparent",
    paddingTop: sticky ? "4px" : "0",
    paddingBottom: sticky ? "4px" : "0",
    marginBottom: sticky ? "4px" : "14px",
    boxShadow: sticky ? "0 5px 14px rgba(28,39,24,.08)" : "none",
  });

  const hostHeight = Math.ceil(host.getBoundingClientRect?.().height || 0);
  table.parentElement?.style.setProperty(
    "--cg-snapshot-controls-stack",
    sticky ? `${top + hostHeight + 4}px` : `${top}px`
  );
}

export default function DesktopProductSnapshotControls({ active = true }) {
  const [host, setHost] = useState(null);
  const [table, setTable] = useState(null);
  const [products, setProducts] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [productFitments, setProductFitments] = useState([]);
  const [vehicleFitments, setVehicleFitments] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [vehicleCode, setVehicleCode] = useState("");
  const [modelYear, setModelYear] = useState("");
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;

    Promise.all([
      supabase.from("products").select("id,sku_id,name,product_type,category,fitment"),
      supabase.from("quotes").select("product_id,supplier_sku,supplier_name"),
      supabase.from("product_fitments").select("product_id,fitment_code,year_from,year_to"),
      supabase.from("vehicle_fitments").select("code,display_name,model_year_start,model_year_end,sort_order,active").eq("active", true),
    ]).then(([productResult, quoteResult, fitmentResult, vehicleResult]) => {
      if (cancelled) return;
      if (!productResult.error) setProducts(productResult.data || []);
      if (!quoteResult.error) setQuotes(quoteResult.data || []);
      if (!fitmentResult.error) setProductFitments(fitmentResult.data || []);
      if (!vehicleResult.error) setVehicleFitments(vehicleResult.data || []);
    });

    return () => { cancelled = true; };
  }, [active]);

  const rowsBySku = useMemo(() => {
    const quoteMap = new Map();
    quotes.forEach(quote => {
      const list = quoteMap.get(quote.product_id) || [];
      list.push(quote);
      quoteMap.set(quote.product_id, list);
    });

    const map = new Map();
    products.forEach(product => {
      const productQuotes = quoteMap.get(product.id) || [];
      map.set(product.sku_id, {
        productId: product.id,
        sku: product.sku_id || "",
        name: product.name || product.product_type || "",
        category: product.category || "",
        fitment: product.fitment || "",
        supplierSkus: productQuotes.map(quote => quote.supplier_sku).filter(Boolean),
        supplierNames: productQuotes.map(quote => quote.supplier_name).filter(Boolean),
      });
    });
    return map;
  }, [products, quotes]);

  const categories = useMemo(() => [...new Set(products.map(product => product.category).filter(Boolean))].sort(), [products]);
  const fitmentsByProduct = useMemo(
    () => buildProductFitmentMap(productFitments, vehicleFitments),
    [productFitments, vehicleFitments]
  );
  const vehicleOptions = useMemo(() => vehicleModelOptions(vehicleFitments), [vehicleFitments]);
  const yearOptions = useMemo(() => modelYearOptions(vehicleFitments, vehicleCode), [vehicleFitments, vehicleCode]);

  useEffect(() => {
    if (modelYear && !yearOptions.includes(Number(modelYear))) setModelYear("");
  }, [modelYear, yearOptions]);

  useEffect(() => {
    if (!active) return undefined;
    const media = window.matchMedia("(min-width: 681px)");
    if (!media.matches) return undefined;

    let currentHost = null;
    let currentTable = null;

    const locate = () => {
      const root = document.querySelector(".cg-legacy-embedded");
      if (!root) return;
      const heading = Array.from(root.querySelectorAll("h2")).find(node => String(node.textContent || "").trim() === "Product Cost Snapshot");
      if (!heading) {
        if (currentTable?.parentElement) currentTable.parentElement.style.removeProperty("--cg-snapshot-controls-stack");
        if (currentHost?.isConnected) currentHost.remove();
        currentHost = null;
        currentTable = null;
        setHost(null);
        setTable(null);
        return;
      }

      let card = heading.parentElement;
      while (card && card !== root && !card.querySelector("table")) card = card.parentElement;
      const nextTable = card?.querySelector("table") || null;
      if (!card || !nextTable) return;

      let nextHost = card.querySelector(":scope > .cg-desktop-snapshot-controls-host");
      if (!nextHost) {
        nextHost = document.createElement("div");
        nextHost.className = "cg-desktop-snapshot-controls-host";
        const tableWrap = nextTable.parentElement;
        card.insertBefore(nextHost, tableWrap);
      }

      if (currentHost !== nextHost) {
        currentHost = nextHost;
        setHost(nextHost);
      }
      if (currentTable !== nextTable) {
        currentTable = nextTable;
        setTable(nextTable);
      }

      applyStickyStack(nextHost, nextTable);
    };

    const timer = window.setTimeout(locate, 0);
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", locate);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", locate);
      if (currentTable?.tBodies?.[0]) {
        Array.from(currentTable.tBodies[0].rows).forEach(row => { row.style.display = ""; });
      }
      if (currentTable?.parentElement) currentTable.parentElement.style.removeProperty("--cg-snapshot-controls-stack");
      if (currentHost?.isConnected) currentHost.remove();
    };
  }, [active]);

  useEffect(() => {
    if (!active || !table || !window.matchMedia("(min-width: 681px)").matches) return;
    const body = table.tBodies?.[0];
    if (!body) return;

    const query = normalize(search);
    let count = 0;
    Array.from(body.rows).forEach(row => {
      const sku = String(row.cells?.[0]?.textContent || "").trim();
      const meta = rowsBySku.get(sku);
      const haystack = meta
        ? [meta.sku, meta.name, meta.category, meta.fitment, ...meta.supplierSkus, ...meta.supplierNames].map(normalize)
        : [normalize(row.textContent)];
      const searchMatch = !query || haystack.some(value => value.includes(query));
      const categoryMatch = !category || meta?.category === category;
      const structuredEntries = meta ? fitmentsByProduct.get(meta.productId) || [] : [];
      const fitmentMatch = productMatchesStructuredFitment(structuredEntries, vehicleCode, modelYear);
      const visible = searchMatch && categoryMatch && fitmentMatch;
      row.style.display = visible ? "" : "none";
      if (visible) count += 1;
    });
    setVisibleCount(count);
  }, [active, table, rowsBySku, fitmentsByProduct, search, category, vehicleCode, modelYear]);

  if (!active || !host) return null;

  const filtered = Boolean(search || category || vehicleCode || modelYear);
  return createPortal(
    <div className="cg-desktop-snapshot-controls" aria-label="Product Cost Snapshot filters">
      <label className="cg-desktop-snapshot-search">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search SKU, product or supplier SKU"
          aria-label="Search Product Cost Snapshot"
        />
        {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={16} /></button> : null}
      </label>

      <label className="cg-desktop-snapshot-filter">
        <span>Category</span>
        <select value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {categories.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>

      <label className="cg-desktop-snapshot-filter fitment">
        <span>Vehicle Model</span>
        <select value={vehicleCode} onChange={event => setVehicleCode(event.target.value)}>
          <option value="">All models</option>
          {vehicleOptions.map(option => <option key={option.code} value={option.code}>{option.display_name}</option>)}
        </select>
      </label>

      <label className="cg-desktop-snapshot-filter model-year">
        <span>Model Year</span>
        <select value={modelYear} onChange={event => setModelYear(event.target.value)}>
          <option value="">All years</option>
          {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>

      <div className="cg-desktop-snapshot-result">
        <strong>{visibleCount || products.length}</strong>
        <span>of {products.length} products</span>
        {filtered ? <button type="button" onClick={() => { setSearch(""); setCategory(""); setVehicleCode(""); setModelYear(""); }}>Clear</button> : null}
      </div>
    </div>,
    host
  );
}
