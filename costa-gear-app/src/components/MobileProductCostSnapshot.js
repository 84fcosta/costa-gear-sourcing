import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, ChevronRight, X } from "lucide-react";
import { supabase } from "../supabase";
import { selectBestQuote } from "../domain/sourcingIntelligence";
import {
  buildProductFitmentMap,
  modelYearOptions,
  productMatchesStructuredFitment,
  vehicleModelOptions,
} from "../domain/structuredFitmentFilter";
import "../mobile-product-snapshot.css";

const SORT_KEY = "cg-sourcing-mobile-sort";

const toNumber = value => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const money = value => {
  const number = toNumber(value);
  return number === null
    ? "-"
    : number.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });
};

const targetSell = (product, landedCad) => {
  const explicit = toNumber(product?.target_sell_price_cad);
  if (explicit !== null) return explicit;

  const marginPct = toNumber(product?.target_margin_pct);
  if (landedCad !== null && marginPct !== null && marginPct > 0 && marginPct < 95) {
    return landedCad / (1 - marginPct / 100);
  }

  return landedCad !== null ? landedCad * 2.2 : null;
};

const marketReference = product => toNumber(
  product?.market_reference_cad ?? product?.market_price_cad ?? product?.competitor_price_cad
);

const updatedValue = (product, quotes) => {
  const values = [product?.updated_at, product?.created_at, ...quotes.map(q => q.updated_at || q.quote_date || q.created_at)]
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
};

const statusFor = row => {
  if (row.landedCad === null) return { label: "Missing cost", tone: "warning" };
  if (row.marketCad === null) return { label: "No benchmark", tone: "muted" };
  if (row.targetSellCad === null) return null;
  if (row.targetSellCad > row.marketCad * 1.05) return { label: "Above market", tone: "warning" };
  if (row.targetSellCad < row.marketCad * 0.95) return { label: "Below market", tone: "positive" };
  return { label: "Near market", tone: "neutral" };
};

export default function MobileProductCostSnapshot({ active = true }) {
  const [products, setProducts] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [productFitments, setProductFitments] = useState([]);
  const [vehicleFitments, setVehicleFitments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(() => {
    try { return window.localStorage.getItem(SORT_KEY) || "sku-asc"; }
    catch { return "sku-asc"; }
  });
  const [category, setCategory] = useState("");
  const [vehicleCode, setVehicleCode] = useState("");
  const [modelYear, setModelYear] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!active) return undefined;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError("");
      const [
        { data: productRows, error: productError },
        { data: quoteRows, error: quoteError },
        { data: productFitmentRows, error: productFitmentError },
        { data: vehicleFitmentRows, error: vehicleFitmentError },
      ] = await Promise.all([
        supabase.from("products").select("*").order("sku_id"),
        supabase.from("quotes").select("*").order("quote_date", { ascending: false }),
        supabase.from("product_fitments").select("product_id,fitment_code,year_from,year_to"),
        supabase.from("vehicle_fitments").select("code,display_name,model_year_start,model_year_end,sort_order,active").eq("active", true),
      ]);
      if (!mounted) return;
      if (productError || quoteError || productFitmentError || vehicleFitmentError) {
        setError((productError || quoteError || productFitmentError || vehicleFitmentError)?.message || "Unable to load product costs.");
      } else {
        setProducts(productRows || []);
        setQuotes(quoteRows || []);
        setProductFitments(productFitmentRows || []);
        setVehicleFitments(vehicleFitmentRows || []);
      }
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, [active]);

  useEffect(() => {
    try { window.localStorage.setItem(SORT_KEY, sort); } catch {}
  }, [sort]);

  const rows = useMemo(() => products.map(product => {
    const productQuotes = quotes.filter(quote => quote.product_id === product.id);
    const best = selectBestQuote(productQuotes);
    const landedCad = best?.landed?.complete ? toNumber(best.landed.totalCad) : null;
    const marketCad = marketReference(product);
    const targetSellCad = targetSell(product, landedCad);
    const shippingCad = best?.landed?.complete ? toNumber(best.landed.shippingCad) : null;
    const supplierSkus = productQuotes.map(quote => quote.supplier_sku).filter(Boolean);
    const bestQuote = best?.quote || null;
    return {
      id: product.id,
      sku: product.sku_id || "",
      name: product.name || product.product_type || "Unnamed product",
      productType: product.product_type || "",
      fitment: product.fitment || "",
      category: product.category || "",
      material: product.material || "",
      landedCad,
      targetSellCad,
      marketCad,
      shippingCad,
      bestSupplier: bestQuote?.supplier_name || "",
      supplierSku: bestQuote?.supplier_sku || supplierSkus[0] || "",
      supplierSkus,
      quoteCount: productQuotes.length,
      updatedAt: updatedValue(product, productQuotes),
    };
  }), [products, quotes]);

  const categories = useMemo(() => [...new Set(rows.map(row => row.category).filter(Boolean))].sort(), [rows]);
  const fitmentsByProduct = useMemo(
    () => buildProductFitmentMap(productFitments, vehicleFitments),
    [productFitments, vehicleFitments]
  );
  const vehicleOptions = useMemo(() => vehicleModelOptions(vehicleFitments), [vehicleFitments]);
  const yearOptions = useMemo(() => modelYearOptions(vehicleFitments, vehicleCode), [vehicleFitments, vehicleCode]);

  useEffect(() => {
    if (modelYear && !yearOptions.includes(Number(modelYear))) setModelYear("");
  }, [modelYear, yearOptions]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = rows.filter(row => {
      const matchesSearch = !query || [row.sku, row.name, row.productType, row.fitment, ...row.supplierSkus]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query));
      const fitmentMatch = productMatchesStructuredFitment(
        fitmentsByProduct.get(row.id) || [],
        vehicleCode,
        modelYear
      );
      return matchesSearch && (!category || row.category === category) && fitmentMatch;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "sku-desc") return b.sku.localeCompare(a.sku, undefined, { numeric: true });
      if (sort === "product-asc") return a.name.localeCompare(b.name);
      if (sort === "landed-asc") return (a.landedCad ?? Number.POSITIVE_INFINITY) - (b.landedCad ?? Number.POSITIVE_INFINITY);
      if (sort === "landed-desc") return (b.landedCad ?? Number.NEGATIVE_INFINITY) - (a.landedCad ?? Number.NEGATIVE_INFINITY);
      if (sort === "market-desc") return (b.marketCad ?? Number.NEGATIVE_INFINITY) - (a.marketCad ?? Number.NEGATIVE_INFINITY);
      if (sort === "updated-desc") return b.updatedAt - a.updatedAt;
      return a.sku.localeCompare(b.sku, undefined, { numeric: true });
    });
  }, [rows, search, category, vehicleCode, modelYear, fitmentsByProduct, sort]);

  const filterCount = Number(Boolean(category)) + Number(Boolean(vehicleCode)) + Number(Boolean(modelYear));

  if (!active) return null;

  return <section className="cg-mobile-product-snapshot" aria-label="Product Cost Snapshot">
    <div className="cg-mobile-snapshot-head">
      <div>
        <h2>Product Cost Snapshot</h2>
        <p>Cost, selling price and benchmark at a glance.</p>
      </div>
      <span>{visibleRows.length}</span>
    </div>

    <div className="cg-mobile-snapshot-search">
      <Search size={18} aria-hidden="true" />
      <input
        type="search"
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder="Search SKU, product or supplier SKU"
        aria-label="Search products"
      />
      {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={17} /></button>}
    </div>

    <div className="cg-mobile-snapshot-controls">
      <label>
        <span>Sort</span>
        <select value={sort} onChange={event => setSort(event.target.value)}>
          <option value="sku-asc">SKU A-Z</option>
          <option value="sku-desc">SKU Z-A</option>
          <option value="product-asc">Product A-Z</option>
          <option value="landed-asc">Landed cost: Low to high</option>
          <option value="landed-desc">Landed cost: High to low</option>
          <option value="market-desc">Market price: High to low</option>
          <option value="updated-desc">Recently updated</option>
        </select>
      </label>
      <button type="button" className={filterCount ? "active" : ""} onClick={() => setFilterOpen(true)}>
        <SlidersHorizontal size={17} /> Filter{filterCount ? ` (${filterCount})` : ""}
      </button>
    </div>

    {loading && <div className="cg-mobile-snapshot-state">Loading product costs...</div>}
    {error && <div className="cg-mobile-snapshot-state error">{error}</div>}
    {!loading && !error && visibleRows.length === 0 && <div className="cg-mobile-snapshot-state">No products match this search.</div>}

    <div className="cg-mobile-snapshot-list">
      {visibleRows.map(row => {
        const status = statusFor(row);
        return <button key={row.id} type="button" className="cg-mobile-product-card" onClick={() => setDetail(row)}>
          <div className="cg-mobile-product-card-main">
            <div className="cg-mobile-product-card-title">
              <strong>{row.sku}</strong>
              {status && <span className={`cg-mobile-cost-status ${status.tone}`}>{status.label}</span>}
            </div>
            <div className="cg-mobile-product-name">{row.name}</div>
            <div className="cg-mobile-product-fitment">{row.fitment || "Fitment not specified"}</div>
          </div>
          <div className="cg-mobile-product-landed">
            <strong>{money(row.landedCad)}</strong>
            <span>Landed</span>
          </div>
          <div className="cg-mobile-product-prices">
            <span>Sell <strong>{money(row.targetSellCad)}</strong></span>
            <span>Market <strong>{money(row.marketCad)}</strong></span>
            <span>Shipping <strong>{money(row.shippingCad)}</strong></span>
          </div>
          <ChevronRight className="cg-mobile-product-chevron" size={20} aria-hidden="true" />
        </button>;
      })}
    </div>

    {filterOpen && <div className="cg-mobile-snapshot-backdrop" onClick={() => setFilterOpen(false)}>
      <div className="cg-mobile-snapshot-sheet" onClick={event => event.stopPropagation()}>
        <div className="cg-mobile-snapshot-sheet-handle" />
        <div className="cg-mobile-snapshot-sheet-head">
          <div><strong>Filter products</strong><span>Limit the snapshot without changing Product Master.</span></div>
          <button type="button" onClick={() => setFilterOpen(false)}>Done</button>
        </div>
        <label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Vehicle Model<select value={vehicleCode} onChange={event => setVehicleCode(event.target.value)}><option value="">All models</option>{vehicleOptions.map(value => <option key={value.code} value={value.code}>{value.display_name}</option>)}</select></label>
        <label>Model Year<select value={modelYear} onChange={event => setModelYear(event.target.value)}><option value="">All years</option>{yearOptions.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
        {filterCount > 0 && <button type="button" className="cg-mobile-snapshot-clear" onClick={() => { setCategory(""); setVehicleCode(""); setModelYear(""); }}>Clear filters</button>}
      </div>
    </div>}

    {detail && <div className="cg-mobile-snapshot-backdrop" onClick={() => setDetail(null)}>
      <div className="cg-mobile-snapshot-sheet cg-mobile-product-detail" onClick={event => event.stopPropagation()}>
        <div className="cg-mobile-snapshot-sheet-handle" />
        <div className="cg-mobile-snapshot-sheet-head">
          <div><strong>{detail.sku}</strong><span>{detail.name}</span></div>
          <button type="button" onClick={() => setDetail(null)}>Close</button>
        </div>
        <div className="cg-mobile-product-detail-grid">
          <div><span>Landed cost</span><strong>{money(detail.landedCad)}</strong></div>
          <div><span>Target sell</span><strong>{money(detail.targetSellCad)}</strong></div>
          <div><span>Market reference</span><strong>{money(detail.marketCad)}</strong></div>
          <div><span>Shipping / unit</span><strong>{money(detail.shippingCad)}</strong></div>
        </div>
        <div className="cg-mobile-product-detail-meta">
          <div><span>Best supplier</span><strong>{detail.bestSupplier || "Not available"}</strong></div>
          <div><span>Supplier SKU</span><strong>{detail.supplierSku || "Not available"}</strong></div>
          <div><span>Quotes</span><strong>{detail.quoteCount}</strong></div>
          <div><span>Material</span><strong>{detail.material || "Not specified"}</strong></div>
          <div><span>Fitment</span><strong>{detail.fitment || "Not specified"}</strong></div>
        </div>
      </div>
    </div>}
  </section>;
}
