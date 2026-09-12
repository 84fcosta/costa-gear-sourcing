import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { supabase } from "../supabase";
import "../desktop-sourcing-overrides.css";

const normalize = value => String(value || "").trim().toLowerCase();
const DESKTOP_STICKY_BREAKPOINT = 1180;

function topbarHeight() {
  const topbar = document.querySelector(".cg-topbar");
  return Math.round(topbar?.getBoundingClientRect?.().height || 96);
}

function applyStickyStack(host, list) {
  if (!host || !list) return;
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
  list.style.setProperty(
    "--cg-product-controls-stack",
    sticky ? `${top + hostHeight + 4}px` : `${top}px`
  );
}

function productCards(list, headerHost) {
  return Array.from(list?.children || []).filter(node => {
    if (node === headerHost || node.hasAttribute?.("data-cg-product-table-header")) return false;
    const text = String(node.textContent || "");
    return /CG-[A-Z]{2}-\d{2}/.test(text) && Array.from(node.querySelectorAll("button")).some(button => String(button.textContent || "").trim() === "Edit");
  });
}

function cardSku(card) {
  const text = String(card?.textContent || "");
  return text.match(/CG-[A-Z]{2}-\d{2}/)?.[0] || "";
}

export default function DesktopProductMasterControls({ active = true }) {
  const [host, setHost] = useState(null);
  const [list, setList] = useState(null);
  const [headerHost, setHeaderHost] = useState(null);
  const [legacyFilterRow, setLegacyFilterRow] = useState(null);
  const [products, setProducts] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [fitment, setFitment] = useState("");
  const [visibleCount, setVisibleCount] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;

    Promise.all([
      supabase.from("products").select("id,sku_id,name,product_type,material,category,fitment"),
      supabase.from("quotes").select("product_id,supplier_sku,supplier_name"),
    ]).then(([productResult, quoteResult]) => {
      if (cancelled) return;
      if (!productResult.error) setProducts(productResult.data || []);
      if (!quoteResult.error) setQuotes(quoteResult.data || []);
    });

    return () => { cancelled = true; };
  }, [active]);

  const rowsBySku = useMemo(() => {
    const quoteMap = new Map();
    quotes.forEach(quote => {
      const entries = quoteMap.get(quote.product_id) || [];
      entries.push(quote);
      quoteMap.set(quote.product_id, entries);
    });

    const map = new Map();
    products.forEach(product => {
      const productQuotes = quoteMap.get(product.id) || [];
      map.set(product.sku_id, {
        sku: product.sku_id || "",
        name: product.name || product.product_type || "",
        productType: product.product_type || "",
        material: product.material || "",
        category: product.category || "",
        fitment: product.fitment || "",
        supplierSkus: productQuotes.map(quote => quote.supplier_sku).filter(Boolean),
        supplierNames: productQuotes.map(quote => quote.supplier_name).filter(Boolean),
      });
    });
    return map;
  }, [products, quotes]);

  const categories = useMemo(() => [...new Set(products.map(product => product.category).filter(Boolean))].sort(), [products]);
  const fitments = useMemo(() => [...new Set(products.map(product => product.fitment).filter(Boolean))].sort(), [products]);

  useEffect(() => {
    if (!active) return undefined;
    const media = window.matchMedia("(min-width: 681px)");
    if (!media.matches) return undefined;

    let currentHost = null;
    let currentList = null;
    let currentHeader = null;
    let currentLegacyRow = null;

    const reset = () => {
      if (currentList && currentHeader) {
        productCards(currentList, currentHeader).forEach(card => { card.style.display = ""; });
      }
      if (currentLegacyRow?.isConnected) currentLegacyRow.style.display = "";
      if (currentList) currentList.style.removeProperty("--cg-product-controls-stack");
      if (currentHost?.isConnected) currentHost.remove();
      currentHost = null;
      currentList = null;
      currentHeader = null;
      currentLegacyRow = null;
      setHost(null);
      setList(null);
      setHeaderHost(null);
      setLegacyFilterRow(null);
    };

    const locate = () => {
      const root = document.querySelector(".cg-legacy-embedded");
      const nextHeader = root?.querySelector("[data-cg-product-table-header]") || null;
      const nextList = nextHeader?.parentElement || null;
      if (!root || !nextHeader || !nextList) {
        if (currentHost || currentList || currentHeader) reset();
        return;
      }

      const legacySearch = Array.from(root.querySelectorAll('input[type="text"], input[type="search"]')).find(input =>
        String(input.getAttribute("placeholder") || "").toLowerCase().includes("search sku or name")
      );
      const nextLegacyRow = legacySearch?.parentElement?.parentElement || null;
      if (nextLegacyRow) nextLegacyRow.style.display = "none";

      let nextHost = nextList.querySelector(":scope > .cg-desktop-product-controls-host");
      if (!nextHost) {
        nextHost = document.createElement("div");
        nextHost.className = "cg-desktop-snapshot-controls-host cg-desktop-product-controls-host";
        nextList.insertBefore(nextHost, nextHeader);
      }

      if (currentHost !== nextHost) {
        currentHost = nextHost;
        setHost(nextHost);
      }
      if (currentList !== nextList) {
        currentList = nextList;
        setList(nextList);
      }
      if (currentHeader !== nextHeader) {
        currentHeader = nextHeader;
        setHeaderHost(nextHeader);
      }
      if (currentLegacyRow !== nextLegacyRow) {
        if (currentLegacyRow?.isConnected && currentLegacyRow !== nextLegacyRow) currentLegacyRow.style.display = "";
        currentLegacyRow = nextLegacyRow;
        setLegacyFilterRow(nextLegacyRow);
      }

      applyStickyStack(nextHost, nextList);
    };

    const timer = window.setTimeout(locate, 0);
    const observer = new MutationObserver(() => {
      locate();
      setRevision(value => value + 1);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", locate);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", locate);
      reset();
    };
  }, [active]);

  useEffect(() => {
    if (!active || !list || !headerHost || !window.matchMedia("(min-width: 681px)").matches) return;

    const apply = () => {
      const query = normalize(search);
      let count = 0;
      productCards(list, headerHost).forEach(card => {
        const sku = cardSku(card);
        const meta = rowsBySku.get(sku);
        const haystack = meta
          ? [
              meta.sku,
              meta.name,
              meta.productType,
              meta.material,
              meta.category,
              meta.fitment,
              ...meta.supplierSkus,
              ...meta.supplierNames,
            ].map(normalize)
          : [normalize(card.textContent)];
        const searchMatch = !query || haystack.some(value => value.includes(query));
        const categoryMatch = !category || meta?.category === category;
        const fitmentMatch = !fitment || meta?.fitment === fitment;
        const visible = searchMatch && categoryMatch && fitmentMatch;
        card.style.display = visible ? "grid" : "none";
        if (visible) count += 1;
      });
      setVisibleCount(count);
    };

    apply();
  }, [active, list, headerHost, rowsBySku, search, category, fitment, revision]);

  if (!active || !host) return null;

  const filtered = Boolean(search || category || fitment);
  const countLabel = filtered ? visibleCount : products.length;

  return createPortal(
    <div className="cg-desktop-snapshot-controls" aria-label="Product filters">
      <label className="cg-desktop-snapshot-search">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search SKU, product or supplier SKU"
          aria-label="Search products"
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
        <span>Fitment</span>
        <select value={fitment} onChange={event => setFitment(event.target.value)}>
          <option value="">All fitments</option>
          {fitments.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>

      <div className="cg-desktop-snapshot-result">
        <strong>{countLabel}</strong>
        <span>of {products.length} products</span>
        {filtered ? <button type="button" onClick={() => { setSearch(""); setCategory(""); setFitment(""); }}>Clear</button> : null}
      </div>
    </div>,
    host
  );
}
