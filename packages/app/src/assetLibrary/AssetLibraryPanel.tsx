"use client";

/**
 * Asset Library shell (#819) — the reusable browser that houses every asset
 * type. It knows nothing sound- or viz-specific: it enumerates the registered
 * {@link AssetProvider}s, applies the search + type + source filters, and
 * renders a windowed list of provider-supplied {@link Asset}s. Each row exposes
 * two uniform action slots — a primary preview (play/stop) and a hover insert —
 * that just drive `asset.preview()` / `asset.insert()`.
 *
 * The concrete Sounds provider lands in #820; until then a demo stub (behind the
 * `stave.assetLibrary.demo` localStorage flag) exercises the shell.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import {
  listAssetProviders,
  subscribeToAssetProviders,
} from "./registry";
import {
  availableSources,
  availableTypes,
  collectAssets,
  type AssetFilter,
} from "./filter";
import { computeWindow } from "./windowing";
import type { Asset, AssetPreviewHandle, AssetSource, AssetType } from "./types";

const ROW_HEIGHT = 40;
/** Extra rows rendered above/below the viewport so fast scrolls don't flash. */
const OVERSCAN = 6;
/** How long the copy button shows its "copied" check before reverting. */
const COPIED_MS = 1200;

/** Copy text to the clipboard — async Clipboard API with an execCommand
 *  fallback for non-secure contexts. Resolves true on success. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const TYPE_LABELS: Record<AssetType, string> = {
  sound: "Sounds",
  viz: "Viz",
  snippet: "Snippets",
  sample: "Samples",
};
const SOURCE_LABELS: Record<AssetSource, string> = {
  "built-in": "Built-in",
  user: "User",
  community: "Community",
};

export function AssetLibraryPanel({ onClose }: { onClose?: () => void }) {
  // Re-render on any provider registration / catalog change.
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeToAssetProviders(() => setTick((t) => t + 1)), []);
  const providers = useMemo(() => listAssetProviders(), [tick]);

  const [query, setQuery] = useState("");
  const [type, setType] = useState<AssetType | null>(null);
  const [source, setSource] = useState<AssetSource | null>(null);

  const filter: AssetFilter = useMemo(
    () => ({ query, type, source }),
    [query, type, source],
  );
  const assets = useMemo(
    () => collectAssets(providers, filter),
    [providers, filter],
  );

  const types = useMemo(() => availableTypes(providers), [providers]);
  const sources = useMemo(() => availableSources(providers), [providers]);
  const loading = providers.some((p) => p.isLoading?.() ?? false);

  // A type/source chip that filters to a value no longer present would strand
  // the list empty with no way back — drop the filter if its value vanished.
  useEffect(() => {
    if (type && !types.includes(type)) setType(null);
  }, [type, types]);
  useEffect(() => {
    if (source && !sources.includes(source)) setSource(null);
  }, [source, sources]);

  // ---- Single-active-preview: starting a row stops the previous one. --------
  const activePreview = useRef<{ key: string; handle: AssetPreviewHandle | null } | null>(null);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);

  const stopPreview = useCallback(() => {
    activePreview.current?.handle?.stop();
    activePreview.current = null;
    setPreviewingKey(null);
  }, []);

  // Stop any preview when the panel unmounts (closed / project switch).
  useEffect(() => stopPreview, [stopPreview]);

  const togglePreview = useCallback(
    async (key: string, asset: Asset) => {
      if (!asset.preview) return;
      if (previewingKey === key) {
        stopPreview();
        return;
      }
      stopPreview();
      setPreviewingKey(key);
      // Mark this the active request BEFORE awaiting so a slower earlier start
      // can't clobber a newer one.
      const token = { key, handle: null as AssetPreviewHandle | null };
      activePreview.current = token;
      try {
        const handle = await asset.preview();
        if (activePreview.current !== token) {
          // A newer preview started (or stop fired) while we awaited — cancel.
          handle?.stop();
          return;
        }
        token.handle = handle ?? null;
        // Fire-and-forget previews (void handle) clear the "playing" badge
        // immediately; sustained ones keep it until stop.
        if (!handle) setPreviewingKey((cur) => (cur === key ? null : cur));
      } catch {
        if (activePreview.current === token) stopPreview();
      }
    },
    [previewingKey, stopPreview],
  );

  return (
    <div style={styles.root} data-sidebar data-asset-library>
      <div style={styles.header}>
        <span>LIBRARY</span>
        {onClose && (
          <button
            style={styles.headerClose}
            title="Close"
            aria-label="Close Library"
            onClick={onClose}
          >
            <Icon name="chevron-left" size="14px" />
          </button>
        )}
      </div>

      <div style={styles.controls}>
        <input
          style={styles.search}
          placeholder="Search assets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-asset-search
          aria-label="Search assets"
        />
        {types.length > 1 && (
          <ChipRow
            label="Type"
            active={type}
            values={types}
            render={(t) => TYPE_LABELS[t]}
            onPick={(t) => setType(t)}
            dataAttr="asset-type-filter"
          />
        )}
        {sources.length > 1 && (
          <ChipRow
            label="Source"
            active={source}
            values={sources}
            render={(s) => SOURCE_LABELS[s]}
            onPick={(s) => setSource(s)}
            dataAttr="asset-source-filter"
          />
        )}
      </div>

      <AssetList
        assets={assets}
        loading={loading}
        previewingKey={previewingKey}
        onTogglePreview={togglePreview}
        // Reset scroll to top when the FILTER changes (not when the catalog
        // grows under a stable filter) — a new search starts at the top, but
        // browsing position survives a lazily-growing provider.
        resetKey={`${type ?? ""}|${source ?? ""}|${query}`}
      />
    </div>
  );
}

/** A labelled row of mutually-exclusive filter chips ("All" + each value). */
function ChipRow<T extends string>({
  label,
  active,
  values,
  render,
  onPick,
  dataAttr,
}: {
  label: string;
  active: T | null;
  values: readonly T[];
  render: (v: T) => string;
  onPick: (v: T | null) => void;
  dataAttr: string;
}) {
  return (
    <div style={styles.chipRow} data-filter={dataAttr} aria-label={`${label} filter`}>
      <button
        style={{ ...styles.chip, ...(active === null ? styles.chipActive : {}) }}
        onClick={() => onPick(null)}
        aria-pressed={active === null}
        data-chip="all"
      >
        All
      </button>
      {values.map((v) => (
        <button
          key={v}
          style={{ ...styles.chip, ...(active === v ? styles.chipActive : {}) }}
          onClick={() => onPick(active === v ? null : v)}
          aria-pressed={active === v}
          data-chip={v}
        >
          {render(v)}
        </button>
      ))}
    </div>
  );
}

/** Windowed list — renders only the rows in view (+overscan). The sound catalog
 *  is ~1800 rows, so full rendering would jank; a fixed row height lets us map
 *  scrollTop → visible slice without measuring. */
function AssetList({
  assets,
  loading,
  previewingKey,
  onTogglePreview,
  resetKey,
}: {
  assets: Asset[];
  loading: boolean;
  previewingKey: string | null;
  onTogglePreview: (key: string, asset: Asset) => void;
  resetKey: string;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  // Callback ref, NOT a mount effect: the scroll node only exists once the
  // catalog is non-empty, so a one-shot `[]` effect that reads scrollRef at
  // first mount misses the loading→loaded transition (the node is null then
  // and the effect never re-runs). A stable callback ref fires on every
  // attach/detach, so the observer wires up whenever the list actually renders
  // — including after a lazy provider (sounds) warms up. (F1)
  const setScrollEl = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    nodeRef.current = el;
    if (!el) return;
    setViewportH(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    roRef.current = ro;
  }, []);
  useEffect(() => () => roRef.current?.disconnect(), []);

  // Reset scroll when the filter changes so a new search starts at the top and
  // a stale scrollTop can't point past the (now shorter) content. (F2)
  useEffect(() => {
    if (nodeRef.current) nodeRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [resetKey]);

  const total = assets.length;
  // `computeWindow` clamps `first` so a stale (too-large) scrollTop after the
  // list shrinks can never produce an empty slice (start > end → blank). (F2)
  const { first, last } = computeWindow(total, scrollTop, viewportH, ROW_HEIGHT, OVERSCAN);
  const slice = assets.slice(first, last);

  if (loading && total === 0) {
    return (
      <div style={styles.listEmpty} data-asset-list data-state="loading">
        Loading assets…
      </div>
    );
  }
  if (total === 0) {
    return (
      <div style={styles.listEmpty} data-asset-list data-state="empty">
        No assets match.
      </div>
    );
  }

  return (
    <div
      ref={setScrollEl}
      style={styles.listScroll}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      data-asset-list
      data-count={String(total)}
    >
      <div style={{ height: total * ROW_HEIGHT, position: "relative" }}>
        {slice.map((asset, i) => {
          const index = first + i;
          const key = `${asset.type}:${asset.id}`;
          return (
            <AssetRow
              key={key}
              asset={asset}
              rowKey={key}
              top={index * ROW_HEIGHT}
              previewing={previewingKey === key}
              onTogglePreview={onTogglePreview}
            />
          );
        })}
      </div>
    </div>
  );
}

function AssetRow({
  asset,
  rowKey,
  top,
  previewing,
  onTogglePreview,
}: {
  asset: Asset;
  rowKey: string;
  top: number;
  previewing: boolean;
  onTogglePreview: (key: string, asset: Asset) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const handleCopy = useCallback(() => {
    void copyToClipboard(asset.id).then((ok) => {
      if (!ok) return;
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    });
  }, [asset.id]);

  return (
    <div
      style={{ ...styles.row, top }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-asset-row={rowKey}
    >
      <div style={styles.rowText}>
        <span style={styles.rowName}>{asset.name}</span>
        {asset.group && <span style={styles.rowGroup}>{asset.group}</span>}
      </div>
      <div style={styles.rowActions}>
        {/* Copy the code name (asset.id) — hover-revealed; brief check on success. */}
        {(hovered || previewing || copied) && (
          <button
            style={{ ...styles.rowBtn, ...(copied ? styles.rowBtnActive : {}) }}
            title={copied ? "Copied!" : `Copy "${asset.id}"`}
            aria-label={`Copy name ${asset.id}`}
            onClick={handleCopy}
            data-asset-copy={rowKey}
          >
            <Icon name={copied ? "check" : "copy"} size="14px" />
          </button>
        )}
        {/* Insert — hover-revealed secondary slot. */}
        {asset.insert && (hovered || previewing) && (
          <button
            style={styles.rowBtn}
            title="Insert into code"
            aria-label={`Insert ${asset.name}`}
            onClick={() => asset.insert?.()}
            data-asset-insert={rowKey}
          >
            <Icon name="add" size="14px" />
          </button>
        )}
        {/* Preview — primary slot; play toggles to stop while active. */}
        {asset.preview && (
          <button
            style={{ ...styles.rowBtn, ...(previewing ? styles.rowBtnActive : {}) }}
            title={previewing ? "Stop" : "Preview"}
            aria-label={previewing ? `Stop ${asset.name}` : `Preview ${asset.name}`}
            onClick={() => onTogglePreview(rowKey, asset)}
            data-asset-preview={rowKey}
          >
            <Icon name={previewing ? "debug-stop" : "play"} size="14px" />
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: 260,
    height: "100%",
    background: "var(--bg-panel)",
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, sans-serif",
    minHeight: 0,
  },
  header: {
    padding: "10px 14px",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.8,
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-subtle)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerClose: {
    background: "none",
    border: "none",
    color: "var(--text-icon-muted)",
    cursor: "pointer",
    padding: 2,
    display: "flex",
    alignItems: "center",
  },
  controls: {
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    borderBottom: "1px solid var(--border-subtle)",
  },
  search: {
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 8px",
    fontSize: 12,
    color: "var(--text-primary)",
    background: "var(--bg-input, var(--bg-chrome))",
    border: "1px solid var(--border-subtle)",
    borderRadius: 4,
    outline: "none",
    fontFamily: "inherit",
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },
  chip: {
    padding: "2px 8px",
    fontSize: 11,
    color: "var(--text-secondary)",
    background: "transparent",
    border: "1px solid var(--border-subtle)",
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "inherit",
    lineHeight: 1.6,
  },
  chipActive: {
    color: "var(--text-primary)",
    background: "var(--accent-soft, var(--bg-chrome))",
    borderColor: "var(--accent-strong)",
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
  },
  listEmpty: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    fontSize: 12,
    color: "var(--text-tertiary)",
    textAlign: "center",
  },
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 8px 0 14px",
    boxSizing: "border-box",
    gap: 6,
  },
  rowText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flex: 1,
  },
  rowName: {
    fontSize: 12,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowGroup: {
    fontSize: 10,
    color: "var(--text-tertiary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowActions: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  rowBtn: {
    width: 24,
    height: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    borderRadius: 4,
    color: "var(--text-icon-muted)",
    cursor: "pointer",
    padding: 0,
  },
  rowBtnActive: {
    color: "var(--accent-strong)",
  },
};
