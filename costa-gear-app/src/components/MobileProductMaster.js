import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, ChevronRight, Pencil, Plus, Images } from "lucide-react";
import { supabase } from "../supabase";
import "../mobile-product-master.css";

const money = value => {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
};

const getProductsSection = () => {
  const headings = Array.from(document.querySelectorAll(".cg-legacy-embedded h2"));
  const heading = headings.find(node => String(node.textContent || "").trim() === "Products");
  return heading?.parentElement?.parentElement || null;
};

const findLegacyProductCard = sku => {
  const section = getProductsSection();
  if (!section) return null;
  const candidates = Array.from(section.querySelectorAll("div"));
  return candidates.find(node => {
    const text = String(node.textContent || "").trim();
    return text.includes(sku) && Array.from(node.querySelectorAll("button")).some(b => String(b.textContent || "").trim() === "Edit");
  }) || null;
};

export default function MobileProductMaster({ active }) {
  const [products, setProducts] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(() => localStorage.getItem("cg-mobile-product-sort") || "sku-asc");
  const [category, setCategory] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [{ data: productRows }, { data: quoteRows }, { data: imageRows }] = await Promise.all([
        supabase.from("products").select("id,sku_id,name,product_type,material,fitment,category,updated_at").order("sku_id"),
        supabase.from("quotes").select("id,product_id,unit_price"),
        supabase.from("product_images").select("id,product_id"),
      ]);
      if (!cancelled) {
        setProducts(productRows || []);
        setQuotes(quoteRows || []);
        setImages(imageRows || []);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    let attempts = 0;
    const hideLegacy = () => {
      const section = getProductsSection();
      if (section) {
        section.dataset.cgMobileHidden = "true";
        section.style.display = "none";
        return;
      }
      attempts += 1;
      if (attempts < 12) window.setTimeout(hideLegacy, 60);
    };
    const timer = window.setTimeout(hideLegacy, 0);
    return () => {
      window.clearTimeout(timer);
      const section = document.querySelector('[data-cg-mobile-hidden="true"]');
      if (section) {
        section.style.display = "";
        delete section.dataset.cgMobileHidden;
      }
    };
  }, [active]);

  const enriched = useMemo(() => products.map(product => {
    const productQuotes = quotes.filter(q => q.product_id === product.id);
    const prices = productQuotes.map(q => Number(q.unit_price)).filter(Number.isFinite);
    const imageCount = images.filter(image => image.product_id === product.id).length;
    return {
      ...product,
      quoteCount: productQuotes.length,
      imageCount,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
    };
  }), [products, quotes, images]);

  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))].sort(), [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = enriched.filter(p => {
      const matchesSearch = !q || [p.sku_id, p.name, p.product_type, p.material, p.fitment, p.category]
        .some(value => String(value || "").toLowerCase().includes(q));
      return matchesSearch && (!category || p.category === category);
    });
    rows.sort((a, b) => {
      if (sort === "sku-desc") return String(b.sku_id || "").localeCompare(String(a.sku_id || ""), undefined, { numeric: true });
      if (sort === "product-asc") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sort === "quotes-desc") return b.quoteCount - a.quoteCount || String(a.sku_id || "").localeCompare(String(b.sku_id || ""), undefined, { numeric: true });
      if (sort === "updated-desc") return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
      return String(a.sku_id || "").localeCompare(String(b.sku_id || ""), undefined, { numeric: true });
    });
    return rows;
  }, [enriched, search, category, sort]);

  const setSortPersisted = value => {
    setSort(value);
    localStorage.setItem("cg-mobile-product-sort", value);
  };

  const triggerAdd = () => {
    const section = getProductsSection();
    const button = Array.from(section?.querySelectorAll("button") || []).find(b => String(b.textContent || "").includes("Add Product"));
    button?.click();
  };

  const triggerEdit = sku => {
    const card = findLegacyProductCard(sku);
    const button = Array.from(card?.querySelectorAll("button") || []).find(b => String(b.textContent || "").trim() === "Edit");
    button?.click();
  };

  const triggerImages = sku => {
    const card = findLegacyProductCard(sku);
    const button = Array.from(card?.querySelectorAll("button") || []).find(b => /images?/i.test(String(b.textContent || "")));
    if (button) button.click();
    else triggerDetail(sku);
  };

  const triggerDetail = sku => {
    const card = findLegacyProductCard(sku);
    const clickable = Array.from(card?.querySelectorAll("div") || []).find(node => node.style?.cursor === "pointer");
    clickable?.click();
  };

  if (!active) return null;

  return <section className="cg-mobile-product-master" aria-label="Product Master mobile list">
    <div className="cg-mobile-product-master-head">
      <div>
        <h2>Products</h2>
        <p>{visible.length} of {products.length} products</p>
      </div>
      <button type="button" className="cg-mobile-product-add" onClick={triggerAdd}><Plus size={18}/>Add</button>
    </div>

    <div className="cg-mobile-product-search">
      <Search size={18}/>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU or product" />
    </div>

    <div className="cg-mobile-product-controls">
      <select value={sort} onChange={e => setSortPersisted(e.target.value)} aria-label="Sort products">
        <option value="sku-asc">SKU A-Z</option>
        <option value="sku-desc">SKU Z-A</option>
        <option value="product-asc">Product A-Z</option>
        <option value="quotes-desc">Most quotes</option>
        <option value="updated-desc">Recently updated</option>
      </select>
      <button type="button" className={filtersOpen || category ? "active" : ""} onClick={() => setFiltersOpen(v => !v)}>
        <SlidersHorizontal size={17}/>Filter{category ? " · 1" : ""}
      </button>
    </div>

    {filtersOpen && <div className="cg-mobile-product-filter-panel">
      <label>Category
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      {category && <button type="button" onClick={() => setCategory("")}>Clear filter</button>}
    </div>}

    {loading ? <div className="cg-mobile-product-empty">Loading products...</div> : visible.length === 0 ?
      <div className="cg-mobile-product-empty">No products match your filters.</div> :
      <div className="cg-mobile-product-list">
        {visible.map(product => {
          const range = product.minPrice === null ? "No quotes" : product.minPrice === product.maxPrice ? money(product.minPrice) : `${money(product.minPrice)} - ${money(product.maxPrice)}`;
          return <article key={product.id} className="cg-mobile-product-card">
            <button type="button" className="cg-mobile-product-card-main" onClick={() => triggerDetail(product.sku_id)}>
              <div className="cg-mobile-product-card-top">
                <span className="cg-mobile-product-sku">{product.sku_id}</span>
                <ChevronRight size={20}/>
              </div>
              <strong className="cg-mobile-product-name">{product.name || "Unnamed product"}</strong>
              <div className="cg-mobile-product-detail-row">
                <span>Fitment</span>
                <strong>{product.fitment || "TBD"}</strong>
              </div>
              <div className="cg-mobile-product-detail-grid">
                <div><span>Material</span><strong>{product.material || "TBD"}</strong></div>
                <div><span>Category</span><strong>{product.category || "Not set"}</strong></div>
              </div>
            </button>

            <div className="cg-mobile-product-commercial">
              <div>
                <span>Cost / Quotes</span>
                <strong>{range}</strong>
                <small>{product.quoteCount} {product.quoteCount === 1 ? "quote" : "quotes"}</small>
              </div>
              <button type="button" className="cg-mobile-product-images" onClick={() => triggerImages(product.sku_id)}>
                <Images size={17}/><strong>{product.imageCount}</strong><span>{product.imageCount === 1 ? "Image" : "Images"}</span>
              </button>
            </div>

            <div className="cg-mobile-product-card-foot">
              <button type="button" className="cg-mobile-product-view" onClick={() => triggerDetail(product.sku_id)}>View details</button>
              <button type="button" className="cg-mobile-product-edit" onClick={() => triggerEdit(product.sku_id)}><Pencil size={16}/>Edit</button>
            </div>
          </article>;
        })}
      </div>}
  </section>;
}
