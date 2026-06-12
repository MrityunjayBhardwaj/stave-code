"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import {
  BackdropPopover,
  type BackdropPopoverVizFile,
} from "./BackdropPopover";
import { showToast } from "../dialogs/host";

const GITHUB_REPO_URL = "https://github.com/MrityunjayBhardwaj/stave-code";

interface MenuBarProps {
  projectName: string;
  onOpenEditorSettings: () => void;
  onOpenShortcuts: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onRenameProject: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  onShareProject: () => void;
  onVersionHistory: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  onToggleZenMode: () => void;
  zenMode: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Current backdrop file id, or null when none pinned. */
  backgroundFileId?: string | null;
  /** Display name of pinned backdrop (basename minus extension). */
  backgroundFileName?: string | null;
  /** All viz files eligible for pinning (`.hydra` / `.p5`). */
  vizFiles?: readonly BackdropPopoverVizFile[];
  /** Pin or clear the backdrop — null clears. */
  onSetBackdrop?: (fileId: string | null) => void;
  /** Open the backdrop crop popup for the current backdrop. */
  onCropBackground?: () => void;
  /** Reveal the pinned file's editor tab. */
  onRevealBackground?: () => void;
}

type MenuId = "file" | "edit" | "view" | "settings" | null;

export function MenuBar({
  projectName: _projectName,
  onOpenEditorSettings,
  onOpenShortcuts,
  onNewProject,
  onOpenProject,
  onRenameProject,
  onExportProject,
  onImportProject,
  onShareProject,
  onVersionHistory,
  onToggleSidebar,
  sidebarCollapsed,
  onToggleZenMode,
  zenMode,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  backgroundFileId,
  backgroundFileName,
  vizFiles = [],
  onSetBackdrop,
  onRevealBackground,
  onCropBackground,
}: MenuBarProps) {
  // Popover open/close state — single surface that handles both
  // "set a backdrop" (when unpinned) and "tweak this backdrop"
  // (when pinned). Anchored to the indicator button.
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const indicatorRef = useRef<HTMLButtonElement | null>(null);

  const toggleBackdropPopover = () => {
    if (popoverOpen) {
      setPopoverOpen(false);
      return;
    }
    const el = indicatorRef.current;
    if (el) setAnchorRect(el.getBoundingClientRect());
    setPopoverOpen(true);
  };

  const pinned = backgroundFileId != null;
  const hasVizFiles = vizFiles.length > 0;
  // Only render the indicator when there's something actionable —
  // either a pinned backdrop OR viz files available to pin.
  const showIndicator = pinned || hasVizFiles;
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside OR Escape
  useEffect(() => {
    if (!openMenu) return;
    const mouseHandler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", mouseHandler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", mouseHandler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [openMenu]);

  const clickItem = useCallback((action: () => void) => {
    setOpenMenu(null);
    action();
  }, []);

  return (
    <div ref={barRef} style={styles.bar}>
      <MenuButton label="File" open={openMenu === "file"} onClick={() => setOpenMenu(openMenu === "file" ? null : "file")}>
        <MenuItem label="New Project..." shortcut="⌘N" onClick={() => clickItem(onNewProject)} />
        <MenuItem label="Open Project..." shortcut="⌘O" onClick={() => clickItem(onOpenProject)} />
        <MenuDivider />
        <MenuItem label="Rename Project..." onClick={() => clickItem(onRenameProject)} />
        <MenuItem label="Version History..." onClick={() => clickItem(onVersionHistory)} />
        <MenuDivider />
        <MenuItem label="Import from .zip..." onClick={() => clickItem(onImportProject)} />
        <MenuItem label="Export as .zip" onClick={() => clickItem(onExportProject)} />
        <MenuDivider />
        <MenuItem label="Copy Share Link" onClick={() => clickItem(onShareProject)} />
      </MenuButton>

      <MenuButton label="Edit" open={openMenu === "edit"} onClick={() => setOpenMenu(openMenu === "edit" ? null : "edit")}>
        <MenuItem label="Undo" shortcut="⌘Z" onClick={() => clickItem(onUndo)} disabled={!canUndo} />
        <MenuItem label="Redo" shortcut="⌘⇧Z" onClick={() => clickItem(onRedo)} disabled={!canRedo} />
        <MenuDivider />
        <MenuItem label="Find..." shortcut="⌘F" onClick={() => setOpenMenu(null)} disabled />
      </MenuButton>

      <MenuButton label="View" open={openMenu === "view"} onClick={() => setOpenMenu(openMenu === "view" ? null : "view")}>
        <MenuItem
          label={sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
          shortcut="⌘B"
          onClick={() => clickItem(onToggleSidebar)}
        />
        <MenuItem
          label={zenMode ? "Exit Zen Mode" : "Zen Mode (Fullscreen)"}
          shortcut="⌘K Z"
          onClick={() => clickItem(onToggleZenMode)}
        />
      </MenuButton>

      <div data-stave-brand style={styles.brand} aria-hidden="true">
        Stave Code
      </div>

      <div style={styles.spacer} />

      {/* Backdrop indicator — single entry point. Click opens the
          popover which handles both "set backdrop" (unpinned) and
          full controls (pinned). Kept visible whenever there's a
          viz file to pin or a backdrop already pinned — so the
          control is self-sustaining without going through the
          file tree or Settings. */}
      {showIndicator && (
        <div style={styles.bgCluster}>
          <button
            ref={indicatorRef}
            data-testid="menubar-bg-indicator"
            data-pinned={pinned ? "true" : "false"}
            title={
              pinned
                ? `Backdrop: ${backgroundFileName} — click for controls`
                : "Set a viz as backdrop"
            }
            onClick={toggleBackdropPopover}
            style={styles.bgIndicator}
          >
            <span
              style={{
                ...styles.bgRecDot,
                ...(pinned ? {} : styles.bgRecDotIdle),
              }}
              aria-hidden="true"
            />
            <span style={styles.bgText}>
              <span style={styles.bgLabel}>
                {pinned ? "bg:" : "set bg"}
              </span>
              {pinned && (
                <span style={styles.bgFileName}>{backgroundFileName}</span>
              )}
            </span>
            <span style={{ color: "var(--foreground-muted)", fontSize: 9 }}>
              ▾
            </span>
          </button>
          {popoverOpen && anchorRect && (
            <BackdropPopover
              anchorRect={anchorRect}
              onClose={() => setPopoverOpen(false)}
              vizFiles={vizFiles}
              backgroundFileId={backgroundFileId ?? null}
              backgroundFileName={backgroundFileName ?? null}
              onSetBackdrop={(id) => onSetBackdrop?.(id)}
              onCropBackground={() => onCropBackground?.()}
              onRevealBackground={() => onRevealBackground?.()}
            />
          )}
        </div>
      )}
      <div style={styles.cornerCluster} data-stave-corner>
        <CornerButton
          testid="docs"
          variant="text"
          title="Documentation"
          ariaLabel="Open documentation"
          onClick={() => { window.open("/docs/", "_blank", "noopener,noreferrer"); }}
        >
          Docs
        </CornerButton>
        <CornerButton
          testid="github"
          variant="icon"
          title="GitHub repository"
          ariaLabel="GitHub repository"
          onClick={() => { window.open(GITHUB_REPO_URL, "_blank", "noopener,noreferrer"); }}
        >
          <Icon name="github-inverted" size={16} />
        </CornerButton>
        <CornerButton
          testid="signin"
          variant="primary"
          title="Sign in (coming soon)"
          ariaLabel="Sign in — coming soon"
          onClick={() => showToast("Sign-in coming soon", "info")}
        >
          Sign in
        </CornerButton>
      </div>
      <div style={styles.menuButtonWrap}>
        <button
          style={{ ...styles.gearBtn, ...(openMenu === "settings" ? styles.menuButtonOpen : {}) }}
          onClick={() => setOpenMenu(openMenu === "settings" ? null : "settings")}
          title="Settings"
          aria-label="Settings"
        >
          <Icon name="settings-gear" size="var(--ui-icon-size, 25px)" />
        </button>
        {openMenu === "settings" && (
          <div style={{ ...styles.dropdown, right: 0, left: "auto" }}>
            <MenuItem label="Editor Settings..." onClick={() => clickItem(onOpenEditorSettings)} />
            <MenuItem label="Keyboard Shortcuts..." onClick={() => clickItem(onOpenShortcuts)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

/**
 * Top-bar corner button (Docs / GitHub / Sign in). Accent-tinted
 * `primary` variant for sign-in; `text` for prose actions; `icon` for
 * icon-only buttons. All variants share a subtle hover background so
 * the cluster feels clickable — MenuButton has the same treatment via
 * `menuButtonOpen`.
 */
function CornerButton({
  testid,
  variant,
  title,
  ariaLabel,
  onClick,
  children,
}: {
  testid: string;
  variant: "text" | "icon" | "primary";
  title: string;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const base =
    variant === "text"
      ? styles.cornerTextBtn
      : variant === "icon"
      ? styles.cornerIconBtn
      : styles.cornerSignInBtn;
  const hoverStyle =
    hover && variant === "primary"
      ? styles.cornerSignInBtnHover
      : hover
      ? styles.cornerHover
      : undefined;
  return (
    <button
      data-stave-corner-item={testid}
      style={{ ...base, ...(hoverStyle ?? {}) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

function MenuButton({
  label, open, onClick, children,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.menuButtonWrap}>
      <button
        onClick={onClick}
        style={{ ...styles.menuButton, ...(open ? styles.menuButtonOpen : {}) }}
      >
        {label}
      </button>
      {open && <div style={styles.dropdown}>{children}</div>}
    </div>
  );
}

function MenuItem({
  label, shortcut, onClick, disabled,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      data-stave-menu-item
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ ...styles.menuItem, ...(disabled ? styles.menuItemDisabled : {}) }}
    >
      <span>{label}</span>
      {shortcut && <span style={styles.shortcut}>{shortcut}</span>}
    </button>
  );
}

function MenuDivider() {
  return <div style={styles.divider} />;
}

// ── Styles ─────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: "relative" as const,
    display: "flex",
    alignItems: "center",
    height: 28,
    background: "var(--bg-chrome)",
    borderBottom: "1px solid var(--border-subtle)",
    color: "var(--text-chrome)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 12,
    userSelect: "none",
    paddingLeft: 6,
  },
  brand: {
    position: "absolute" as const,
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none" as const,
    color: "var(--text-secondary)",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 0.4,
    whiteSpace: "nowrap" as const,
  },
  menuButtonWrap: {
    position: "relative" as const,
  },
  menuButton: {
    background: "none",
    border: "none",
    color: "var(--text-chrome)",
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 12,
    borderRadius: 3,
  },
  menuButtonOpen: {
    background: "var(--bg-hover)",
  },
  dropdown: {
    position: "absolute" as const,
    top: "100%",
    left: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 4,
    padding: "4px 0",
    zIndex: 9998,
    minWidth: 200,
    boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
  },
  menuItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "5px 14px",
    background: "none",
    border: "none",
    color: "var(--text-chrome)",
    fontSize: 12,
    textAlign: "left" as const,
    cursor: "pointer",
  },
  menuItemDisabled: {
    color: "var(--text-disabled)",
    cursor: "default",
  },
  shortcut: {
    color: "var(--text-muted)",
    fontSize: 11,
    marginLeft: 20,
  },
  divider: {
    height: 1,
    background: "var(--border-subtle)",
    margin: "4px 0",
  },
  spacer: {
    flex: 1,
  },
  gearBtn: {
    background: "none",
    border: "none",
    color: "var(--text-icon)",
    cursor: "pointer",
    fontSize: "var(--ui-icon-size, 25px)",
    padding: "0 12px",
    height: "100%",
    lineHeight: 1,
    fontFamily: "inherit",
  },
  bgIndicator: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: "calc(100% - 8px)",
    margin: "4px 4px 4px 0",
    padding: "0 10px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: "var(--surface-elevated, var(--surface))",
    color: "var(--text-primary)",
    fontSize: 11,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  bgRecDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ef4444",
    boxShadow: "0 0 6px rgba(239, 68, 68, 0.7)",
    animation: "stave-bg-rec-pulse 1.6s ease-in-out infinite",
    flexShrink: 0,
  },
  bgRecDotIdle: {
    background: "var(--text-muted, #6a6a88)",
    boxShadow: "none",
    animation: "none",
  },
  bgText: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: 4,
  },
  bgLabel: {
    color: "var(--text-secondary)",
    fontSize: 10,
    letterSpacing: 0.3,
  },
  bgFileName: {
    color: "var(--text-primary)",
    fontSize: 11,
    maxWidth: 200,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  bgCluster: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: "calc(100% - 8px)",
    margin: "4px 4px 4px 0",
  },
  cornerCluster: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    height: "100%",
    marginRight: 4,
  },
  cornerTextBtn: {
    background: "none",
    border: "none",
    color: "var(--text-chrome)",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
    padding: "4px 10px",
    borderRadius: 3,
    lineHeight: 1,
  },
  cornerIconBtn: {
    background: "none",
    border: "none",
    color: "var(--text-icon, var(--text-chrome))",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 3,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
  },
  cornerSignInBtn: {
    background: "var(--accent, #8b5cf6)",
    border: "1px solid var(--accent, #8b5cf6)",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 500,
    fontFamily: "inherit",
    padding: "4px 10px",
    borderRadius: 3,
    lineHeight: 1,
    marginLeft: 4,
    transition: "filter 80ms ease, background 80ms ease",
  },
  cornerHover: {
    background: "var(--bg-hover)",
  },
  cornerSignInBtnHover: {
    filter: "brightness(1.15)",
  },
};
