"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

interface MenuBarProps {
  projectName: string;
  onNewProject: () => void;
  onOpenProject: () => void;
  onRenameProject: () => void;
  onExportProject: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

type MenuId = "file" | "edit" | "view" | "help" | null;

export function MenuBar({
  projectName,
  onNewProject,
  onOpenProject,
  onRenameProject,
  onExportProject,
  onToggleSidebar,
  sidebarCollapsed,
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
        <MenuDivider />
        <MenuItem label="Export as .zip" onClick={() => clickItem(onExportProject)} />
      </MenuButton>

      <MenuButton label="Edit" open={openMenu === "edit"} onClick={() => setOpenMenu(openMenu === "edit" ? null : "edit")}>
        <MenuItem label="Undo" shortcut="⌘Z" onClick={() => setOpenMenu(null)} disabled />
        <MenuItem label="Redo" shortcut="⌘⇧Z" onClick={() => setOpenMenu(null)} disabled />
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
      <div style={styles.projectName}>{projectName}</div>
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
    background: "#0d0d1a",
    borderBottom: "1px solid #2a2a4a",
    color: "#c8c8d4",
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
    color: "#c8c8d4",
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 12,
    borderRadius: 3,
  },
  menuButtonOpen: {
    background: "#2a2a4a",
  },
  dropdown: {
    position: "absolute" as const,
    top: "100%",
    left: 0,
    background: "#1e1e38",
    border: "1px solid #3a3a5a",
    borderRadius: 4,
    padding: "4px 0",
    zIndex: 9998,
    minWidth: 200,
    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
  },
  menuItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "5px 14px",
    background: "none",
    border: "none",
    color: "#c8c8d4",
    fontSize: 12,
    textAlign: "left" as const,
    cursor: "pointer",
  },
  menuItemDisabled: {
    color: "#555566",
    cursor: "default",
  },
  shortcut: {
    color: "#6a6a88",
    fontSize: 11,
    marginLeft: 20,
  },
  divider: {
    height: 1,
    background: "#2a2a4a",
    margin: "4px 0",
  },
  spacer: {
    flex: 1,
  },
  projectName: {
    color: "#8888aa",
    fontSize: 11,
    paddingRight: 12,
    fontStyle: "italic",
  },
};
