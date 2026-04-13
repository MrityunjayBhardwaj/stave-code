"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectMeta } from "@stave/editor";

interface ProjectSidebarProps {
  projects: ProjectMeta[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onRenameProject: (id: string, name: string) => void;
  onDuplicateProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  collapsed,
  onToggleCollapse,
}: ProjectSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu]);

  // Focus input when editing
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEditing = useCallback(
    (id: string, currentName: string) => {
      setEditingId(id);
      setEditValue(currentName);
      setContextMenu(null);
    },
    [],
  );

  const commitRename = useCallback(() => {
    if (editingId && editValue.trim()) {
      onRenameProject(editingId, editValue.trim());
    }
    setEditingId(null);
  }, [editingId, editValue, onRenameProject]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      setContextMenu({ id, x: e.clientX, y: e.clientY });
    },
    [],
  );

  if (collapsed) {
    return (
      <div style={styles.collapsedBar}>
        <button
          onClick={onToggleCollapse}
          style={styles.expandBtn}
          title="Expand projects"
        >
          {"▸"}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <span style={styles.title}>Projects</span>
        <div style={styles.headerActions}>
          <button onClick={onNewProject} style={styles.iconBtn} title="New project">
            +
          </button>
          <button onClick={onToggleCollapse} style={styles.iconBtn} title="Collapse">
            {"◂"}
          </button>
        </div>
      </div>

      <div style={styles.list}>
        {projects.map((p) => (
          <div
            key={p.id}
            style={{
              ...styles.item,
              ...(p.id === activeProjectId ? styles.itemActive : {}),
            }}
            onClick={() => {
              if (editingId !== p.id) onSelectProject(p.id);
            }}
            onContextMenu={(e) => handleContextMenu(e, p.id)}
            onDoubleClick={() => startEditing(p.id, p.name)}
          >
            {editingId === p.id ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setEditingId(null);
                }}
                style={styles.renameInput}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span style={styles.itemName}>{p.name}</span>
            )}
          </div>
        ))}
      </div>

      {contextMenu && (
        <div
          style={{
            ...styles.contextMenu,
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <button
            data-stave-menu-item
            style={styles.menuItem}
            onClick={() => {
              const proj = projects.find((p) => p.id === contextMenu.id);
              if (proj) startEditing(proj.id, proj.name);
            }}
          >
            Rename
          </button>
          <button
            data-stave-menu-item
            style={styles.menuItem}
            onClick={() => {
              onDuplicateProject(contextMenu.id);
              setContextMenu(null);
            }}
          >
            Duplicate
          </button>
          {projects.length > 1 && (
            <button
              data-stave-menu-item
              data-danger="true"
              style={{ ...styles.menuItem, color: "var(--danger-fg)" }}
              onClick={() => {
                onDeleteProject(contextMenu.id);
                setContextMenu(null);
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 200,
    minWidth: 200,
    height: "100%",
    background: "var(--bg-sidebar)",
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 13,
    color: "var(--text-chrome)",
    userSelect: "none",
  },
  collapsedBar: {
    width: 28,
    minWidth: 28,
    height: "100%",
    background: "var(--bg-sidebar)",
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 8,
  },
  expandBtn: {
    background: "none",
    border: "none",
    color: "var(--text-icon)",
    cursor: "pointer",
    fontSize: 14,
    padding: "4px 6px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: {
    fontWeight: 600,
    fontSize: 12,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "var(--text-tertiary)",
  },
  headerActions: {
    display: "flex",
    gap: 2,
  },
  iconBtn: {
    background: "none",
    border: "none",
    color: "var(--text-icon)",
    cursor: "pointer",
    fontSize: 16,
    padding: "2px 6px",
    borderRadius: 3,
  },
  list: {
    flex: 1,
    overflow: "auto",
    padding: "4px 0",
  },
  item: {
    padding: "6px 10px",
    cursor: "pointer",
    borderRadius: 3,
    margin: "1px 4px",
    display: "flex",
    alignItems: "center",
  },
  itemActive: {
    background: "var(--bg-hover)",
    color: "var(--text-primary)",
  },
  itemName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  renameInput: {
    background: "var(--bg-input)",
    border: "1px solid var(--border-stronger)",
    borderRadius: 3,
    color: "var(--text-primary)",
    fontSize: 13,
    padding: "2px 4px",
    width: "100%",
    outline: "none",
  },
  contextMenu: {
    position: "fixed" as const,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 4,
    padding: "4px 0",
    zIndex: 9999,
    minWidth: 120,
    boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
  },
  menuItem: {
    display: "block",
    width: "100%",
    padding: "6px 12px",
    background: "none",
    border: "none",
    color: "var(--text-chrome)",
    fontSize: 13,
    textAlign: "left" as const,
    cursor: "pointer",
  },
};
