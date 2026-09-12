import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import "../desktop-sourcing-overrides.css";

const DESKTOP_STICKY_BREAKPOINT = 1180;
const normalize = value => String(value || "").trim().toLowerCase();

function topbarHeight() {
  const topbar = document.querySelector(".cg-topbar");
  return Math.round(topbar?.getBoundingClientRect?.().height || 96);
}

function supplierCards(list, headerHost, controlsHost) {
  return Array.from(list?.children || []).filter(node => {
    if (node === headerHost || node === controlsHost) return false;
    if (node.hasAttribute?.("data-cg-supplier-table-header")) return false;
    const text = String(node.textContent || "");
    return /SUP-\d{3}/i.test(text);
  });
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
    marginBottom: sticky ? "4px" : "10px",
    boxShadow: sticky ? "0 5px 14px rgba(28,39,24,.08)" : "none",
  });

  const hostHeight = Math.ceil(host.getBoundingClientRect?.().height || 0);
  list.style.setProperty(
    "--cg-supplier-controls-stack",
    sticky ? `${top + hostHeight + 4}px` : `${top}px`
  );
}

export default function DesktopSupplierControls({ active = true }) {
  const [host, setHost] = useState(null);
  const [list, setList] = useState(null);
  const [headerHost, setHeaderHost] = useState(null);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const media = window.matchMedia("(min-width: 681px)");
    if (!media.matches) return undefined;

    let currentHost = null;
    let currentList = null;
    let currentHeader = null;

    const reset = () => {
      if (currentList && currentHeader) {
        supplierCards(currentList, currentHeader, currentHost).forEach(card => {
          card.style.display = "";
        });
        currentList.style.removeProperty("--cg-supplier-controls-stack");
      }
      if (currentHost?.isConnected) currentHost.remove();
      currentHost = null;
      currentList = null;
      currentHeader = null;
      setHost(null);
      setList(null);
      setHeaderHost(null);
      setVisibleCount(0);
      setTotalCount(0);
    };

    const locate = () => {
      const root = document.querySelector(".cg-legacy-embedded");
      const nextHeader = root?.querySelector("[data-cg-supplier-table-header]") || null;
      const nextList = nextHeader?.parentElement || null;

      if (!root || !nextHeader || !nextList) {
        if (currentHost || currentList || currentHeader) reset();
        return;
      }

      let nextHost = nextList.querySelector(":scope > .cg-desktop-supplier-controls-host");
      if (!nextHost) {
        nextHost = document.createElement("div");
        nextHost.className = "cg-desktop-snapshot-controls-host cg-desktop-supplier-controls-host";
        nextList.insertBefore(nextHost, nextHeader);
      }

      currentHost = nextHost;
      currentList = nextList;
      currentHeader = nextHeader;
      setHost(nextHost);
      setList(nextList);
      setHeaderHost(nextHeader);

      const cards = supplierCards(nextList, nextHeader, nextHost);
      setTotalCount(cards.length);
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
    if (!active || !list || !headerHost || !host) return;
    const query = normalize(search);
    let count = 0;

    supplierCards(list, headerHost, host).forEach(card => {
      const visible = !query || normalize(card.textContent).includes(query);
      card.style.display = visible ? "grid" : "none";
      if (visible) count += 1;
    });

    setVisibleCount(count);
  }, [active, list, headerHost, host, search, revision]);

  if (!active || !host) return null;

  const filtered = Boolean(search);
  const countLabel = filtered ? visibleCount : totalCount;

  return createPortal(
    <div className="cg-desktop-snapshot-controls cg-desktop-supplier-controls" aria-label="Supplier search">
      <label className="cg-desktop-snapshot-search">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search supplier ID, name, platform, contact or status"
          aria-label="Search suppliers"
        />
        {search ? (
          <button type="button" onClick={() => setSearch("")} aria-label="Clear supplier search">
            <X size={16} />
          </button>
        ) : null}
      </label>

      <div className="cg-desktop-snapshot-result">
        <strong>{countLabel}</strong>
        <span>of {totalCount} suppliers</span>
        {filtered ? <button type="button" onClick={() => setSearch("")}>Clear</button> : null}
      </div>
    </div>,
    host
  );
}
