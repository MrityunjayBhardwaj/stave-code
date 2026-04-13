"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

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
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

type MenuId = "file" | "edit" | "view" | "help" | "settings" | null;

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
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: MenuBarProps) {
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
      </MenuButton>

      <MenuButton label="Help" open={openMenu === "help"} onClick={() => setOpenMenu(openMenu === "help" ? null : "help")}>
        <MenuItem label="Documentation" onClick={() => { window.open("https://github.com/MrityunjayBhardwaj/stave", "_blank"); setOpenMenu(null); }} />
        <MenuItem label="Report Issue" onClick={() => { window.open("https://github.com/MrityunjayBhardwaj/stave/issues", "_blank"); setOpenMenu(null); }} />
      </MenuButton>

      <div style={styles.spacer} />
      <div style={styles.menuButtonWrap}>
        <button
          style={{ ...styles.gearBtn, ...(openMenu === "settings" ? styles.menuButtonOpen : {}) }}
          onClick={() => setOpenMenu(openMenu === "settings" ? null : "settings")}
          title="Settings"
          aria-label="Settings"
        >⚙</button>
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
    fontSize: 16,
    padding: "0 12px",
    height: "100%",
    lineHeight: 1,
    fontFamily: "inherit",
  },
};
