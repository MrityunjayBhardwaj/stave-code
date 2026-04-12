"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listWorkspaceFiles,
  subscribeToFileList,
  deleteWorkspaceFile,
  renameWorkspaceFile,
  createWorkspaceFile,
  type WorkspaceFile,
} from "@stave/editor";

interface FileTreeProps {
  projectName: string;
  onOpenFile: (fileId: string) => void;
  activeFileId: string | null;
  onToggleCollapse: () => void;
}

interface TreeNode {
  kind: "file" | "folder";
  name: string;
  path: string;
  file?: WorkspaceFile;
  children?: TreeNode[];
}

// ── Tree building ────────────────────────────────────────────────────

function buildTree(files: WorkspaceFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sorted) {
    const segments = file.path.split("/");
    let parentChildren = root;
    let pathSoFar = "";

    // Walk intermediate folders
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg;

      let folder = folderMap.get(pathSoFar);
      if (!folder) {
        folder = {
          kind: "folder",
          name: seg,
          path: pathSoFar,
          children: [],
        };
        folderMap.set(pathSoFar, folder);
        parentChildren.push(folder);
      }
      parentChildren = folder.children!;
    }

    // File at leaf
    const fileName = segments[segments.length - 1];
    parentChildren.push({
      kind: "file",
      name: fileName,
      path: file.path,
      file,
    });
  }

  return root;
}

// ── Main component ──────────────────────────────────────────────────

export function FileTree({
  projectName, onOpenFile, activeFileId, onToggleCollapse,
}: FileTreeProps) {
  // Subscribe to file list changes — re-list whenever a file is added,
  // removed, or renamed. `fileListRev` is the dep that forces the memo
  // to recompute (empty dep array would compute once and never again).
  const [fileListRev, setFileListRev] = useState(0);
  useEffect(() => {
    return subscribeToFileList(() => setFileListRev((n) => n + 1));
  }, []);

  const files = useMemo(() => listWorkspaceFiles(), [fileListRev]);
  const tree = useMemo(() => buildTree(files), [files]);

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // When the active file changes, ensure all its parent folders are
  // expanded so the highlighted file is actually visible in the tree.
  useEffect(() => {
    if (!activeFileId) return;
    const file = files.find((f) => f.id === activeFileId);
    if (!file) return;
    const segments = file.path.split("/");
    if (segments.length <= 1) return; // file is at root, nothing to expand
    setCollapsedFolders((prev) => {
      let changed = false;
      const next = new Set(prev);
      let pathSoFar = "";
      for (let i = 0; i < segments.length - 1; i++) {
        pathSoFar = pathSoFar ? `${pathSoFar}/${segments[i]}` : segments[i];
        if (next.has(pathSoFar)) {
          next.delete(pathSoFar);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeFileId, files]);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    fileId: string;
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
    if (editingFileId && inputRef.current) {
      inputRef.current.focus();
      // Select filename without extension
      const val = inputRef.current.value;
      const dotIdx = val.lastIndexOf(".");
      if (dotIdx > 0) {
        inputRef.current.setSelectionRange(0, dotIdx);
      } else {
        inputRef.current.select();
      }
    }
  }, [editingFileId]);

  const toggleFolder = useCallback((path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const startRename = useCallback((file: WorkspaceFile) => {
    setEditingFileId(file.id);
    const parts = file.path.split("/");
    setEditValue(parts[parts.length - 1]); // just the file name
    setContextMenu(null);
  }, []);

  const commitRename = useCallback(() => {
    if (!editingFileId || !editValue.trim()) {
      setEditingFileId(null);
      return;
    }
    const file = files.find((f) => f.id === editingFileId);
    if (!file) {
      setEditingFileId(null);
      return;
    }
    const parts = file.path.split("/");
    parts[parts.length - 1] = editValue.trim();
    const newPath = parts.join("/");
    renameWorkspaceFile(editingFileId, newPath);
    setEditingFileId(null);
  }, [editingFileId, editValue, files]);

  const handleDelete = useCallback((fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    if (confirm(`Delete "${file.path}"?`)) {
      deleteWorkspaceFile(fileId);
    }
    setContextMenu(null);
  }, [files]);

  const handleNewFile = useCallback((folderPath = "") => {
    const name = prompt("New file name (e.g., sketch.strudel):");
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();
    const path = folderPath ? `${folderPath}/${trimmedName}` : trimmedName;
    const ext = trimmedName.split(".").pop()?.toLowerCase() ?? "";
    const language = extensionToLanguage(ext);
    if (!language) {
      alert(`Unknown file extension ".${ext}". Supported: .strudel, .sonicpi, .hydra, .p5, .md`);
      return;
    }
    const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createWorkspaceFile(id, path, "", language);
  }, []);

  const handleNewFolder = useCallback((parentPath = "") => {
    const name = prompt("New folder name:");
    if (!name || !name.trim()) return;
    // Folders are implicit — create a .keep placeholder file so the folder
    // appears in the tree and persists to IDB. The user can delete it later.
    const folderName = name.trim();
    const path = parentPath ? `${parentPath}/${folderName}/.keep` : `${folderName}/.keep`;
    const id = `file_${Date.now()}_keep`;
    createWorkspaceFile(id, path, "", "markdown");
  }, []);

  // ── Drag-drop move (files + folders) ────────────────────────────────

  // Drop target state — which folder (or root) is currently being hovered
  // over with a dragged item. Drives the visual highlight. `null` = none.
  const [dropTarget, setDropTarget] = useState<string | "__root__" | null>(null);

  // Move a file into a folder (or root if targetFolderPath is ""). No-op
  // if the file is already directly in that folder.
  const moveFileToFolder = useCallback(
    (fileId: string, targetFolderPath: string) => {
      const file = files.find((f) => f.id === fileId);
      if (!file) return;
      const fileName = file.path.split("/").pop()!;
      const newPath = targetFolderPath
        ? `${targetFolderPath}/${fileName}`
        : fileName;
      if (newPath === file.path) return;
      renameWorkspaceFile(fileId, newPath);
    },
    [files],
  );

  // Move a folder (and all its contents) into another folder. Preserves
  // hierarchy: "sketches/foo.strudel" dropped onto "assets/" becomes
  // "assets/sketches/foo.strudel". Prevents dropping a folder into itself
  // or any of its descendants.
  const moveFolderToFolder = useCallback(
    (sourceFolderPath: string, targetFolderPath: string) => {
      if (
        targetFolderPath === sourceFolderPath ||
        targetFolderPath.startsWith(sourceFolderPath + "/")
      ) {
        return; // can't drop into self or descendant
      }
      const folderName = sourceFolderPath.split("/").pop()!;
      const newPrefix = targetFolderPath
        ? `${targetFolderPath}/${folderName}`
        : folderName;
      if (newPrefix === sourceFolderPath) return; // no-op
      const affected = files.filter(
        (f) => f.path === sourceFolderPath || f.path.startsWith(sourceFolderPath + "/"),
      );
      for (const f of affected) {
        const suffix = f.path.slice(sourceFolderPath.length); // keeps leading "/..."
        const newPath = `${newPrefix}${suffix}`;
        renameWorkspaceFile(f.id, newPath);
      }
    },
    [files],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, payload: { kind: "file"; fileId: string } | { kind: "folder"; folderPath: string }) => {
      e.dataTransfer.setData(
        "application/stave-tree-item",
        JSON.stringify(payload),
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleDragOverFolder = useCallback(
    (e: React.DragEvent, folderPath: string) => {
      // Accept only if the drag contains our MIME type.
      if (!e.dataTransfer.types.includes("application/stave-tree-item")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTarget(folderPath);
    },
    [],
  );

  const handleDragOverRoot = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/stave-tree-item")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget("__root__");
  }, []);

  const handleDragLeaveTree = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetFolderPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      const raw = e.dataTransfer.getData("application/stave-tree-item");
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as
          | { kind: "file"; fileId: string }
          | { kind: "folder"; folderPath: string };
        if (payload.kind === "file") {
          moveFileToFolder(payload.fileId, targetFolderPath);
        } else if (payload.kind === "folder") {
          moveFolderToFolder(payload.folderPath, targetFolderPath);
        }
      } catch {
        /* ignore malformed payload */
      }
      setDropTarget(null);
    },
    [moveFileToFolder, moveFolderToFolder],
  );

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <span style={styles.title} title={projectName}>{projectName}</span>
        <div style={styles.headerActions}>
          <button
            style={styles.iconBtn}
            title="New file"
            onClick={() => handleNewFile("")}
          >
            +
          </button>
          <button
            style={styles.iconBtn}
            title="New folder"
            onClick={() => handleNewFolder("")}
          >
            📁
          </button>
          <button
            style={styles.iconBtn}
            title="Collapse sidebar"
            onClick={onToggleCollapse}
          >
            {"◂"}
          </button>
        </div>
      </div>

      <div
        style={{
          ...styles.list,
          ...(dropTarget === "__root__" ? styles.listDropActive : {}),
        }}
        onDragOver={handleDragOverRoot}
        onDragLeave={(e) => {
          // Only clear when leaving the list (not when moving between children)
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            handleDragLeaveTree();
          }
        }}
        onDrop={(e) => handleDrop(e, "")}
      >
        {tree.length === 0 && (
          <div style={styles.empty}>
            <div>Empty project</div>
            <div style={styles.emptyHint}>Click + to add a file</div>
          </div>
        )}
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            collapsedFolders={collapsedFolders}
            onToggleFolder={toggleFolder}
            onOpenFile={onOpenFile}
            activeFileId={activeFileId}
            editingFileId={editingFileId}
            editValue={editValue}
            setEditValue={setEditValue}
            onCommitRename={commitRename}
            onCancelRename={() => setEditingFileId(null)}
            onContextMenu={(fileId, x, y) => setContextMenu({ fileId, x, y })}
            inputRef={inputRef}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            dropTarget={dropTarget}
            onDragStart={handleDragStart}
            onDragOverFolder={handleDragOverFolder}
            onDropOnFolder={handleDrop}
          />
        ))}
      </div>

      {contextMenu && (
        <div
          style={{ ...styles.contextMenu, left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            style={styles.menuItem}
            onClick={() => {
              const f = files.find((x) => x.id === contextMenu.fileId);
              if (f) startRename(f);
            }}
          >
            Rename
          </button>
          <button
            style={{ ...styles.menuItem, color: "#f87171" }}
            onClick={() => handleDelete(contextMenu.fileId)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Recursive TreeItem ──────────────────────────────────────────────

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  collapsedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onOpenFile: (fileId: string) => void;
  activeFileId: string | null;
  editingFileId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onContextMenu: (fileId: string, x: number, y: number) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onNewFile: (folderPath?: string) => void;
  onNewFolder: (parentPath?: string) => void;
  // Drag-drop
  dropTarget: string | "__root__" | null;
  onDragStart: (
    e: React.DragEvent,
    payload:
      | { kind: "file"; fileId: string }
      | { kind: "folder"; folderPath: string },
  ) => void;
  onDragOverFolder: (e: React.DragEvent, folderPath: string) => void;
  onDropOnFolder: (e: React.DragEvent, targetFolderPath: string) => void;
}

function TreeItem(props: TreeItemProps) {
  const { node, depth } = props;

  if (node.kind === "folder") {
    const collapsed = props.collapsedFolders.has(node.path);
    const isDropTarget = props.dropTarget === node.path;
    return (
      <div>
        <div
          data-folder-path={node.path}
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            props.onDragStart(e, { kind: "folder", folderPath: node.path });
          }}
          onDragOver={(e) => {
            e.stopPropagation();
            props.onDragOverFolder(e, node.path);
          }}
          onDrop={(e) => props.onDropOnFolder(e, node.path)}
          style={{
            ...styles.item,
            ...(isDropTarget ? styles.dropTarget : {}),
            paddingLeft: 8 + depth * 12,
          }}
          onClick={() => props.onToggleFolder(node.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            props.onNewFile(node.path);
          }}
        >
          <span style={styles.chevron}>{collapsed ? "▸" : "▾"}</span>
          <span style={styles.folderIcon}>📁</span>
          <span style={styles.itemName}>{node.name}</span>
        </div>
        {!collapsed &&
          node.children!.map((child) => (
            <TreeItem key={child.path} {...props} node={child} depth={depth + 1} />
          ))}
      </div>
    );
  }

  // File
  const file = node.file!;
  const isEditing = props.editingFileId === file.id;
  const isActive = props.activeFileId === file.id;
  // Hide .keep placeholder files
  if (node.name === ".keep") return null;

  return (
    <div
      data-file-tree-item={file.id}
      data-active-file={isActive ? "true" : "false"}
      draggable={!isEditing}
      onDragStart={(e) => {
        e.stopPropagation();
        props.onDragStart(e, { kind: "file", fileId: file.id });
      }}
      style={{
        ...styles.item,
        ...(isActive ? styles.itemActive : {}),
        paddingLeft: 8 + depth * 12,
      }}
      onClick={() => {
        if (!isEditing) props.onOpenFile(file.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onContextMenu(file.id, e.clientX, e.clientY);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
    >
      <span style={styles.fileIcon}>{fileIconFor(node.name)}</span>
      {isEditing ? (
        <input
          ref={props.inputRef}
          value={props.editValue}
          onChange={(e) => props.setEditValue(e.target.value)}
          onBlur={props.onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") props.onCommitRename();
            if (e.key === "Escape") props.onCancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
          style={styles.renameInput}
        />
      ) : (
        <span style={styles.itemName}>{node.name}</span>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function extensionToLanguage(ext: string): WorkspaceFile["language"] | null {
  switch (ext) {
    case "strudel": return "strudel";
    case "sonicpi":
    case "rb": return "sonicpi";
    case "hydra":
    case "hy": return "hydra";
    case "p5":
    case "p5js":
    case "js": return "p5js";
    case "md": return "markdown";
    default: return null;
  }
}

function fileIconFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "strudel": return "🎵";
    case "sonicpi": return "🥁";
    case "hydra": return "✴️";
    case "p5":
    case "p5js": return "✨";
    case "md": return "📝";
    default: return "📄";
  }
}

// ── Styles ─────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 240,
    minWidth: 240,
    height: "100%",
    background: "#1a1a2e",
    borderRight: "1px solid #2a2a4a",
    display: "flex",
    flexDirection: "column" as const,
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 13,
    color: "#c8c8d4",
    userSelect: "none" as const,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    borderBottom: "1px solid #2a2a4a",
    gap: 4,
  },
  title: {
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "#8888aa",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
  headerActions: {
    display: "flex",
    gap: 2,
  },
  iconBtn: {
    background: "none",
    border: "none",
    color: "#8888aa",
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 6px",
    borderRadius: 3,
  },
  list: {
    flex: 1,
    overflow: "auto",
    padding: "4px 0",
  },
  empty: {
    padding: "20px 12px",
    textAlign: "center" as const,
    color: "#6a6a88",
    fontSize: 12,
  },
  emptyHint: {
    marginTop: 4,
    fontSize: 11,
    color: "#4a4a66",
  },
  item: {
    padding: "4px 8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
  },
  itemActive: {
    background: "#2a2a4a",
    color: "#e8e8f0",
    borderLeft: "2px solid #6a6ac8",
    paddingLeft: 6, // compensate for the border
  },
  dropTarget: {
    background: "#3a3a5a",
    outline: "1px dashed #6a6ac8",
    outlineOffset: "-1px",
  },
  listDropActive: {
    background: "#22223a",
    outline: "1px dashed #6a6ac8",
    outlineOffset: "-2px",
  },
  chevron: {
    fontSize: 10,
    width: 10,
    color: "#6a6a88",
  },
  folderIcon: {
    fontSize: 12,
  },
  fileIcon: {
    fontSize: 12,
    marginLeft: 10, // align files under folder-chevron column
  },
  itemName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
  renameInput: {
    background: "#0d0d1a",
    border: "1px solid #4a4a6a",
    borderRadius: 3,
    color: "#e8e8f0",
    fontSize: 13,
    padding: "1px 4px",
    flex: 1,
    outline: "none",
    fontFamily: "inherit",
  },
  contextMenu: {
    position: "fixed" as const,
    background: "#1e1e38",
    border: "1px solid #3a3a5a",
    borderRadius: 4,
    padding: "4px 0",
    zIndex: 9999,
    minWidth: 120,
    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
  },
  menuItem: {
    display: "block",
    width: "100%",
    padding: "6px 12px",
    background: "none",
    border: "none",
    color: "#c8c8d4",
    fontSize: 13,
    textAlign: "left" as const,
    cursor: "pointer",
  },
};
