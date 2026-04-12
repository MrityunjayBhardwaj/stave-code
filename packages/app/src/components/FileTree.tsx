"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listWorkspaceFiles,
  subscribeToFileList,
  deleteWorkspaceFile,
  renameWorkspaceFile,
  createWorkspaceFile,
  getFolderOrder,
  setFolderOrder,
  subscribeToFolderOrder,
  getSubfolderOrder,
  setSubfolderOrder,
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

/**
 * Apply fileOrder and subfolderOrder to a freshly-built alphabetical
 * tree. For each folder (including root, keyed as ""), we partition
 * children into folders + files, then:
 *   - folders are reordered per subfolderOrder (immediate child names).
 *     Unknown names stay alphabetical at the tail.
 *   - files are reordered per fileOrder (file ids). Unknown ids stay
 *     alphabetical at the tail.
 * Final render is `folders first, then files` (VS Code convention).
 */
function applyFolderOrder(
  nodes: TreeNode[],
  folderPath: string,
  getFileOrderFn: (path: string) => string[],
  getSubOrderFn: (path: string) => string[],
): void {
  const folders: TreeNode[] = [];
  const files: TreeNode[] = [];
  for (const n of nodes) {
    if (n.kind === "folder") folders.push(n);
    else files.push(n);
  }

  const fileOrder = getFileOrderFn(folderPath);
  if (fileOrder.length > 0) {
    const idx = new Map<string, number>();
    fileOrder.forEach((id, i) => idx.set(id, i));
    const ordered: TreeNode[] = [];
    const rest: TreeNode[] = [];
    for (const n of files) {
      if (n.file && idx.has(n.file.id)) ordered.push(n);
      else rest.push(n);
    }
    ordered.sort((a, b) => idx.get(a.file!.id)! - idx.get(b.file!.id)!);
    files.length = 0;
    files.push(...ordered, ...rest);
  }

  const subOrder = getSubOrderFn(folderPath);
  if (subOrder.length > 0) {
    const idx = new Map<string, number>();
    subOrder.forEach((name, i) => idx.set(name, i));
    const ordered: TreeNode[] = [];
    const rest: TreeNode[] = [];
    for (const n of folders) {
      if (idx.has(n.name)) ordered.push(n);
      else rest.push(n);
    }
    ordered.sort((a, b) => idx.get(a.name)! - idx.get(b.name)!);
    folders.length = 0;
    folders.push(...ordered, ...rest);
  }

  nodes.length = 0;
  nodes.push(...folders, ...files);

  // Recurse into each folder with that folder's own path as parent.
  for (const n of nodes) {
    if (n.kind === "folder" && n.children) {
      applyFolderOrder(n.children, n.path, getFileOrderFn, getSubOrderFn);
    }
  }
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
  const [folderOrderRev, setFolderOrderRev] = useState(0);
  useEffect(() => {
    return subscribeToFolderOrder(() => setFolderOrderRev((n) => n + 1));
  }, []);

  const files = useMemo(() => listWorkspaceFiles(), [fileListRev]);
  const tree = useMemo(() => {
    const t = buildTree(files);
    applyFolderOrder(
      t,
      "",
      (path) => getFolderOrder(path),
      (path) => getSubfolderOrder(path),
    );
    return t;
    // folderOrderRev is a trigger-only dep — the lookup closes over the
    // store's live state and re-reads on every tree rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, folderOrderRev]);

  // ── Resizable width ─────────────────────────────────────────────────
  // The sidebar width is draggable via a thin handle on the right edge.
  // Persisted to localStorage so it survives refresh. Clamped to a
  // reasonable min/max to avoid degenerate states.
  const MIN_WIDTH = 160;
  const MAX_WIDTH = 600;
  const DEFAULT_WIDTH = 240;
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = window.localStorage.getItem("stave:sidebar-width");
    const parsed = saved ? parseInt(saved, 10) : NaN;
    if (Number.isFinite(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
      return parsed;
    }
    return DEFAULT_WIDTH;
  });

  // Persist to localStorage (debounced slightly via rAF)
  const persistTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (persistTimerRef.current !== null) cancelAnimationFrame(persistTimerRef.current);
    persistTimerRef.current = requestAnimationFrame(() => {
      try { window.localStorage.setItem("stave:sidebar-width", String(width)); } catch { /* ignore quota */ }
    });
    return () => {
      if (persistTimerRef.current !== null) cancelAnimationFrame(persistTimerRef.current);
    };
  }, [width]);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);

  // During a drag, track mouse globally (user can drag outside the
  // sidebar). Using window listeners instead of React events so the
  // drag works even if the pointer leaves the handle briefly.
  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e: MouseEvent) => {
      if (!sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX - rect.left));
      setWidth(next);
    };
    const handleUp = () => setResizing(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    // Disable text selection while dragging
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = "";
    };
  }, [resizing]);

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

  // Between-file drop target for within-folder reorder (PM-3). When the
  // user hovers over a file row with a file drag, we show a 2px insertion
  // indicator above or below depending on cursor Y. `fileId` is the anchor
  // the insertion is relative to; `position` = "above" | "below".
  const [betweenTarget, setBetweenTarget] = useState<{
    fileId: string;
    position: "above" | "below";
  } | null>(null);

  // Between-folder drop target for folder reorder (#14). Activated when
  // dragging a folder over another folder at the same parent level and
  // the cursor is in the top- or bottom- edge zone (25%).
  const [betweenFolderTarget, setBetweenFolderTarget] = useState<{
    folderPath: string;
    position: "above" | "below";
  } | null>(null);

  // Move a file into a folder (or root if targetFolderPath is ""). No-op
  // if the file is already directly in that folder. Also migrates the
  // file's fileOrder entry from the source folder's order array to the
  // target folder's (append at end) so within-folder ordering stays
  // consistent after a cross-folder drop (#15).
  const moveFileToFolder = useCallback(
    (fileId: string, targetFolderPath: string) => {
      const file = files.find((f) => f.id === fileId);
      if (!file) return;
      const fileName = file.path.split("/").pop()!;
      const newPath = targetFolderPath
        ? `${targetFolderPath}/${fileName}`
        : fileName;
      if (newPath === file.path) return;
      const oldFolder = file.path.includes("/")
        ? file.path.slice(0, file.path.lastIndexOf("/"))
        : "";
      renameWorkspaceFile(fileId, newPath);
      if (oldFolder === targetFolderPath) return; // same folder — no order change
      // Remove from source folder order (if present).
      const sourceOrder = getFolderOrder(oldFolder);
      if (sourceOrder.includes(fileId)) {
        setFolderOrder(oldFolder, sourceOrder.filter((id) => id !== fileId));
      }
      // Append to target folder order (creating / extending).
      const targetOrder = getFolderOrder(targetFolderPath);
      if (!targetOrder.includes(fileId)) {
        setFolderOrder(targetFolderPath, [...targetOrder, fileId]);
      }
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
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      // Zone detection: top 25% = insert above, bottom 25% = insert below,
      // middle 50% = drop INTO the folder. Only activate between-zones for
      // folder-folder drags; we can't read payload here (dragover), so
      // we speculatively set betweenFolderTarget + dropTarget and let the
      // drop handler pick the right action from payload kind.
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const y = e.clientY - rect.top;
      const third = rect.height / 4;
      if (y < third) {
        setBetweenFolderTarget({ folderPath, position: "above" });
        setDropTarget(null);
      } else if (y > rect.height - third) {
        setBetweenFolderTarget({ folderPath, position: "below" });
        setDropTarget(null);
      } else {
        setBetweenFolderTarget(null);
        setDropTarget(folderPath);
      }
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
    setBetweenTarget(null);
    setBetweenFolderTarget(null);
  }, []);

  // Dragover on a FILE row — decide whether this is a reorder (within
  // same folder) vs a folder-drop. We always call preventDefault so the
  // drop event can fire. Above midpoint → insert above; below → below.
  const handleDragOverFile = useCallback(
    (e: React.DragEvent, targetFileId: string) => {
      if (!e.dataTransfer.types.includes("application/stave-tree-item")) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      setBetweenTarget({
        fileId: targetFileId,
        position: e.clientY < midY ? "above" : "below",
      });
      setDropTarget(null);
    },
    [],
  );

  // Compute the parent folder path of a file (everything except the last
  // segment). Root returns "".
  const folderPathOf = useCallback((filePath: string) => {
    const i = filePath.lastIndexOf("/");
    return i < 0 ? "" : filePath.slice(0, i);
  }, []);

  // Reorder a folder within its parent. `sourceFolderPath` is the drag
  // source; `anchorFolderPath` is the folder being hovered over; `position`
  // = where the source should land relative to the anchor. Both folders
  // must share the same parent. No-op otherwise.
  const reorderFolderWithin = useCallback(
    (
      sourceFolderPath: string,
      anchorFolderPath: string,
      position: "above" | "below",
    ) => {
      if (sourceFolderPath === anchorFolderPath) return;
      const parentOf = (p: string) => {
        const i = p.lastIndexOf("/");
        return i < 0 ? "" : p.slice(0, i);
      };
      const nameOf = (p: string) => {
        const i = p.lastIndexOf("/");
        return i < 0 ? p : p.slice(i + 1);
      };
      const parent = parentOf(sourceFolderPath);
      if (parent !== parentOf(anchorFolderPath)) return;
      const sourceName = nameOf(sourceFolderPath);
      const anchorName = nameOf(anchorFolderPath);
      // Seed an order from the alphabetical list of siblings (derived
      // from current files — each unique immediate-child folder under
      // `parent`).
      const prefix = parent ? parent + "/" : "";
      const siblingNames = new Set<string>();
      for (const f of files) {
        if (!f.path.startsWith(prefix)) continue;
        const rest = f.path.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash < 0) continue; // file, not a folder
        siblingNames.add(rest.slice(0, slash));
      }
      const existing = getSubfolderOrder(parent).filter((n) => siblingNames.has(n));
      const base =
        existing.length > 0
          ? [
              ...existing,
              ...[...siblingNames]
                .filter((n) => !existing.includes(n))
                .sort(),
            ]
          : [...siblingNames].sort();
      const without = base.filter((n) => n !== sourceName);
      const anchorIdx = without.indexOf(anchorName);
      if (anchorIdx < 0) return;
      const insertAt = position === "above" ? anchorIdx : anchorIdx + 1;
      const next = [
        ...without.slice(0, insertAt),
        sourceName,
        ...without.slice(insertAt),
      ];
      setSubfolderOrder(parent, next);
    },
    [files],
  );

  // Reorder `fileId` within its parent folder relative to `anchorId`.
  // Cross-folder drops are NOT handled here — those still go through
  // handleDrop's moveFileToFolder path.
  const reorderFileWithin = useCallback(
    (fileId: string, anchorId: string, position: "above" | "below") => {
      if (fileId === anchorId) return;
      const source = files.find((f) => f.id === fileId);
      const anchor = files.find((f) => f.id === anchorId);
      if (!source || !anchor) return;
      const folder = folderPathOf(source.path);
      if (folder !== folderPathOf(anchor.path)) return; // MVP: same folder only
      // Seed an order from the current tree view: alphabetical filtered
      // to this folder. Include the current explicit order as a base if
      // present so we don't lose user-set positions for siblings.
      const siblings = files
        .filter(
          (f) =>
            folderPathOf(f.path) === folder && !f.path.endsWith("/.keep"),
        )
        .map((f) => f.id);
      const existing = getFolderOrder(folder).filter((id) =>
        siblings.includes(id),
      );
      const base =
        existing.length > 0
          ? [
              ...existing,
              ...siblings.filter((id) => !existing.includes(id)).sort((a, b) => {
                const fa = files.find((x) => x.id === a)!.path;
                const fb = files.find((x) => x.id === b)!.path;
                return fa.localeCompare(fb);
              }),
            ]
          : [...siblings].sort((a, b) => {
              const fa = files.find((x) => x.id === a)!.path;
              const fb = files.find((x) => x.id === b)!.path;
              return fa.localeCompare(fb);
            });
      // Remove the source from its current position.
      const without = base.filter((id) => id !== fileId);
      const anchorIdx = without.indexOf(anchorId);
      if (anchorIdx < 0) return;
      const insertAt = position === "above" ? anchorIdx : anchorIdx + 1;
      const next = [
        ...without.slice(0, insertAt),
        fileId,
        ...without.slice(insertAt),
      ];
      setFolderOrder(folder, next);
    },
    [files, folderPathOf],
  );

  const handleDropOnFile = useCallback(
    (e: React.DragEvent, targetFileId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const raw = e.dataTransfer.getData("application/stave-tree-item");
      setBetweenTarget(null);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as
          | { kind: "file"; fileId: string }
          | { kind: "folder"; folderPath: string };
        if (payload.kind !== "file") return; // folder-on-file is undefined
        // Resolve position from the last known betweenTarget (it mirrors
        // the dragover state at drop time). Fall back to "below".
        const position = betweenTarget?.position ?? "below";
        reorderFileWithin(payload.fileId, targetFileId, position);
      } catch {
        /* ignore */
      }
    },
    [betweenTarget, reorderFileWithin],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, targetFolderPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      const raw = e.dataTransfer.getData("application/stave-tree-item");
      const pendingBetween = betweenFolderTarget;
      setBetweenFolderTarget(null);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as
          | { kind: "file"; fileId: string }
          | { kind: "folder"; folderPath: string };
        // Folder-on-folder drop AND between-zone active → reorder.
        if (
          payload.kind === "folder" &&
          pendingBetween &&
          pendingBetween.folderPath === targetFolderPath
        ) {
          reorderFolderWithin(
            payload.folderPath,
            targetFolderPath,
            pendingBetween.position,
          );
          setDropTarget(null);
          return;
        }
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
    [moveFileToFolder, moveFolderToFolder, betweenFolderTarget, reorderFolderWithin],
  );

  return (
    <div
      ref={sidebarRef}
      style={{
        ...styles.sidebar,
        width,
        minWidth: width,
      }}
    >
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
            betweenTarget={betweenTarget}
            betweenFolderTarget={betweenFolderTarget}
            onDragStart={handleDragStart}
            onDragOverFolder={handleDragOverFolder}
            onDropOnFolder={handleDrop}
            onDragOverFile={handleDragOverFile}
            onDropOnFile={handleDropOnFile}
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

      {/* Resize handle — 5px wide strip on the right edge. Cursor is
          col-resize; mousedown enters resize mode and window-level
          listeners (see effect above) drive the width update. */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setResizing(true);
        }}
        style={{
          ...styles.resizeHandle,
          ...(resizing ? styles.resizeHandleActive : {}),
        }}
        title="Drag to resize sidebar"
        aria-label="Resize sidebar"
      />
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
  betweenTarget: { fileId: string; position: "above" | "below" } | null;
  betweenFolderTarget: { folderPath: string; position: "above" | "below" } | null;
  onDragStart: (
    e: React.DragEvent,
    payload:
      | { kind: "file"; fileId: string }
      | { kind: "folder"; folderPath: string },
  ) => void;
  onDragOverFolder: (e: React.DragEvent, folderPath: string) => void;
  onDropOnFolder: (e: React.DragEvent, targetFolderPath: string) => void;
  onDragOverFile: (e: React.DragEvent, targetFileId: string) => void;
  onDropOnFile: (e: React.DragEvent, targetFileId: string) => void;
}

function TreeItem(props: TreeItemProps) {
  const { node, depth } = props;

  if (node.kind === "folder") {
    const collapsed = props.collapsedFolders.has(node.path);
    const isDropTarget = props.dropTarget === node.path;
    const bf = props.betweenFolderTarget;
    const showFAbove = bf?.folderPath === node.path && bf.position === "above";
    const showFBelow = bf?.folderPath === node.path && bf.position === "below";
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
            boxShadow: showFAbove
              ? "inset 0 2px 0 0 #7c7cff"
              : showFBelow
              ? "inset 0 -2px 0 0 #7c7cff"
              : undefined,
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

  const between = props.betweenTarget;
  const showAbove = between?.fileId === file.id && between.position === "above";
  const showBelow = between?.fileId === file.id && between.position === "below";

  return (
    <div
      data-file-tree-item={file.id}
      data-active-file={isActive ? "true" : "false"}
      draggable={!isEditing}
      onDragStart={(e) => {
        e.stopPropagation();
        props.onDragStart(e, { kind: "file", fileId: file.id });
      }}
      onDragOver={(e) => props.onDragOverFile(e, file.id)}
      onDrop={(e) => props.onDropOnFile(e, file.id)}
      style={{
        ...styles.item,
        ...(isActive ? styles.itemActive : {}),
        paddingLeft: 8 + depth * 12,
        position: "relative",
        boxShadow: showAbove
          ? "inset 0 2px 0 0 #7c7cff"
          : showBelow
          ? "inset 0 -2px 0 0 #7c7cff"
          : undefined,
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
    // width + minWidth overridden dynamically by the resize hook
    height: "100%",
    background: "#1a1a2e",
    borderRight: "1px solid #2a2a4a",
    display: "flex",
    flexDirection: "column" as const,
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 13,
    color: "#c8c8d4",
    userSelect: "none" as const,
    position: "relative" as const,
  },
  resizeHandle: {
    position: "absolute" as const,
    top: 0,
    right: -2,
    width: 5,
    height: "100%",
    cursor: "col-resize",
    zIndex: 10,
    background: "transparent",
    transition: "background 0.1s",
  },
  resizeHandleActive: {
    background: "#6a6ac8",
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
