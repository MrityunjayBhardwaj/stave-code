"use client";

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
  withStructBatch,
  type WorkspaceFile,
} from "@stave/editor";
import { showPrompt, showConfirm, showToast } from "../dialogs/host";

interface FileTreeProps {
  projectName: string;
  onOpenFile: (fileId: string, intent?: { preview?: boolean }) => void;
  activeFileId: string | null;
  onToggleCollapse: () => void;
  /** Called when a user drops a single .zip onto the sidebar. If set,
   *  the tree skips the normal file-by-file import and delegates. */
  onImportZipProject?: (file: File) => void;
}

export interface FileTreeHandle {
  /** Expand all ancestor folders of the given file and scroll its row
   *  into view. No-op if the file isn't in the current project. */
  revealFile: (fileId: string) => void;
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

export const FileTree = React.forwardRef<FileTreeHandle, FileTreeProps>(function FileTree({
  projectName, onOpenFile, activeFileId, onToggleCollapse, onImportZipProject,
}, forwardedRef) {
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
  // Context menu — kind-tagged so each target (file / folder / empty root)
  // renders its own item list. `x/y` are viewport coords; the menu itself
  // clamps so it never spills off the right or bottom edge.
  type ContextMenuState =
    | { kind: "file"; fileId: string; x: number; y: number }
    | { kind: "folder"; folderPath: string; x: number; y: number }
    | { kind: "root"; x: number; y: number };
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Multi-select state. Cmd/Ctrl-click toggles a file into the set; a
  // plain click clears the set. Selected rows render with the active
  // highlight. Context menu on a multi-selected file shows a bulk
  // "Delete N files" option.
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

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

  // Reveal: expand every ancestor folder + scroll the row into view.
  useImperativeHandle(forwardedRef, () => ({
    revealFile: (fileId: string) => {
      const file = files.find((f) => f.id === fileId);
      if (!file) return;
      setCollapsedFolders((prev) => {
        const next = new Set(prev);
        const segments = file.path.split("/");
        let acc = "";
        for (let i = 0; i < segments.length - 1; i++) {
          acc = acc ? `${acc}/${segments[i]}` : segments[i];
          next.delete(acc);
        }
        return next;
      });
      // Scroll the row into view after the tree has re-rendered.
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(
            `[data-file-tree-item="${CSS.escape(fileId)}"]`,
          );
          el?.scrollIntoView({ block: "nearest" });
        });
      });
    },
  }), [files]);

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

  const handleDuplicate = useCallback((fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    setContextMenu(null);
    const dot = file.path.lastIndexOf(".");
    const slash = file.path.lastIndexOf("/");
    // "foo/bar.strudel" → "foo/bar copy.strudel"; "bar" → "bar copy"
    const newPath = dot > slash
      ? `${file.path.slice(0, dot)} copy${file.path.slice(dot)}`
      : `${file.path} copy`;
    const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createWorkspaceFile(id, newPath, file.content, file.language, file.meta as Record<string, unknown> | undefined);
  }, [files]);

  const handleCopyPath = useCallback(async (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    setContextMenu(null);
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.path);
      showToast(`Copied path: ${file.path}`);
    } catch {
      showToast("Failed to copy — clipboard blocked by browser", "error");
    }
  }, [files]);

  const handleDelete = useCallback(async (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    setContextMenu(null);
    const ok = await showConfirm({
      title: "Delete file?",
      description: `"${file.path}" will be removed from this project.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) deleteWorkspaceFile(fileId);
  }, [files]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedFileIds);
    setContextMenu(null);
    if (ids.length === 0) return;
    const ok = await showConfirm({
      title: `Delete ${ids.length} files?`,
      description: "The selected files will be removed from this project.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    withStructBatch(() => {
      for (const id of ids) deleteWorkspaceFile(id);
    });
    setSelectedFileIds(new Set());
  }, [selectedFileIds]);

  // Folder rename — cascade-rename every file whose path starts with
  // `oldPath + "/"` (plus the .keep placeholder), swapping the prefix.
  const handleRenameFolder = useCallback(async (oldPath: string) => {
    const oldName = oldPath.split("/").pop() ?? "";
    const parentPath = oldPath.includes("/")
      ? oldPath.slice(0, oldPath.lastIndexOf("/"))
      : "";
    setContextMenu(null);
    const newName = await showPrompt({
      title: "Rename folder",
      initialValue: oldName,
      placeholder: "Folder name",
      confirmLabel: "Rename",
    });
    if (!newName || !newName.trim() || newName === oldName) return;
    const newPath = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
    withStructBatch(() => {
      for (const f of files) {
        if (f.path === oldPath || f.path.startsWith(oldPath + "/")) {
          const suffix = f.path.slice(oldPath.length);
          renameWorkspaceFile(f.id, `${newPath}${suffix}`);
        }
      }
    });
  }, [files]);

  // Folder delete — cascade-delete every file under the folder.
  const handleDeleteFolder = useCallback(async (path: string) => {
    const doomed = files.filter(
      (f) => f.path === path || f.path.startsWith(path + "/"),
    );
    setContextMenu(null);
    if (doomed.length === 0) return;
    const visible = doomed.filter((f) => !f.path.endsWith("/.keep")).length;
    const description = visible === 0
      ? `The empty folder "${path}" will be removed.`
      : `"${path}" and ${visible} file${visible === 1 ? "" : "s"} will be removed.`;
    const ok = await showConfirm({
      title: "Delete folder?",
      description,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) {
      withStructBatch(() => {
        for (const f of doomed) deleteWorkspaceFile(f.id);
      });
    }
  }, [files]);

  const handleNewFile = useCallback(async (folderPath = "") => {
    const name = await showPrompt({
      title: "New file",
      description: "Include an extension — .strudel, .sonicpi, .hydra, .p5, or .md.",
      placeholder: "sketch.strudel",
      confirmLabel: "Create",
    });
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();
    const path = folderPath ? `${folderPath}/${trimmedName}` : trimmedName;
    const ext = trimmedName.split(".").pop()?.toLowerCase() ?? "";
    const language = extensionToLanguage(ext);
    if (!language) {
      showToast(
        `Unknown file extension ".${ext}". Supported: .strudel, .sonicpi, .hydra, .p5, .md`,
        "error",
      );
      return;
    }
    const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createWorkspaceFile(id, path, "", language);
  }, []);

  const handleNewFolder = useCallback(async (parentPath = "") => {
    const name = await showPrompt({
      title: "New folder",
      placeholder: "Folder name",
      confirmLabel: "Create",
    });
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
      // Batch all three mutations into ONE transaction so undo reverts
      // the cross-folder move as a single step (instead of 3 separate
      // ones).
      withStructBatch(() => {
        renameWorkspaceFile(fileId, newPath);
        if (oldFolder === targetFolderPath) return;
        const sourceOrder = getFolderOrder(oldFolder);
        if (sourceOrder.includes(fileId)) {
          setFolderOrder(oldFolder, sourceOrder.filter((id) => id !== fileId));
        }
        const targetOrder = getFolderOrder(targetFolderPath);
        if (!targetOrder.includes(fileId)) {
          setFolderOrder(targetFolderPath, [...targetOrder, fileId]);
        }
      });
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
      // Batch so the whole folder move is ONE undo step.
      withStructBatch(() => {
        for (const f of affected) {
          const suffix = f.path.slice(sourceFolderPath.length);
          const newPath = `${newPrefix}${suffix}`;
          renameWorkspaceFile(f.id, newPath);
        }
      });
    },
    [files],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, payload: { kind: "file"; fileId: string } | { kind: "folder"; folderPath: string }) => {
      e.dataTransfer.setData(
        "application/stave-tree-item",
        JSON.stringify(payload),
      );
      // Also set a kind-specific MIME marker so dragover handlers can
      // branch on kind WITHOUT reading the payload body (dataTransfer.getData
      // isn't accessible during dragover in most browsers).
      e.dataTransfer.setData(
        payload.kind === "file"
          ? "application/stave-file-drag"
          : "application/stave-folder-drag",
        "1",
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleDragOverFolder = useCallback(
    (e: React.DragEvent, folderPath: string) => {
      // Accept tree drags OR native OS files.
      const isTree = e.dataTransfer.types.includes("application/stave-tree-item");
      const isFiles = e.dataTransfer.types.includes("Files");
      if (!isTree && !isFiles) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = isFiles ? "copy" : "move";
      // Native file drops always go INTO the folder (no reorder zones).
      if (isFiles) {
        setBetweenFolderTarget(null);
        setDropTarget(folderPath);
        return;
      }
      const isFolderDrag = e.dataTransfer.types.includes(
        "application/stave-folder-drag",
      );
      // For FILE drags, only the "drop INTO folder" affordance is valid
      // (there's nowhere to reorder to — files always render below folders).
      if (!isFolderDrag) {
        setBetweenFolderTarget(null);
        setDropTarget(folderPath);
        return;
      }
      // Folder drag: zone detection — top 25% = insert above,
      // bottom 25% = insert below, middle 50% = nest into the folder.
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
    const isTree = e.dataTransfer.types.includes("application/stave-tree-item");
    const isFiles = e.dataTransfer.types.includes("Files");
    if (!isTree && !isFiles) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = isFiles ? "copy" : "move";
    setDropTarget("__root__");
  }, []);

  // Import native OS files dropped onto the tree. Each file's text
  // content is read, language inferred from extension; unknown
  // extensions are rejected with a toast per file. Creates workspace
  // files under `targetFolderPath` (use "" for root).
  const importNativeFiles = useCallback(async (files: FileList, targetFolderPath: string) => {
    const arr = Array.from(files);
    // A single .zip drop → project import (when the caller wired it).
    if (arr.length === 1 && arr[0].name.toLowerCase().endsWith(".zip")) {
      if (onImportZipProject) {
        onImportZipProject(arr[0]);
      } else {
        showToast("Drop a .zip onto the sidebar to import a project.", "error");
      }
      return;
    }
    for (const f of arr) {
      if (f.name.toLowerCase().endsWith(".zip")) {
        showToast(`Skipped "${f.name}" — drop a single .zip to import as a project.`, "error");
        continue;
      }
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      const language = extensionToLanguage(ext);
      if (!language) {
        showToast(`Skipped "${f.name}" — unsupported extension ".${ext}"`, "error");
        continue;
      }
      const text = await f.text();
      const path = targetFolderPath ? `${targetFolderPath}/${f.name}` : f.name;
      const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      createWorkspaceFile(id, path, text, language);
    }
  }, [onImportZipProject]);

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
      // Only file-on-file drags get the between-indicator. Folder-on-file
      // is a no-op — bail early so no misleading marker shows.
      if (!e.dataTransfer.types.includes("application/stave-file-drag")) return;
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
      // Native OS file drop — import and return.
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        setDropTarget(null);
        setBetweenFolderTarget(null);
        void importNativeFiles(e.dataTransfer.files, targetFolderPath);
        return;
      }
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
    [moveFileToFolder, moveFolderToFolder, betweenFolderTarget, reorderFolderWithin, importNativeFiles],
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
        onContextMenu={(e) => {
          // Only fire for the empty root area — if the click landed on a
          // child row, that row's own handler stops propagation first.
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          setContextMenu({ kind: "root", x: e.clientX, y: e.clientY });
        }}
      >
        {tree.length === 0 && (
          <div style={styles.empty}>
            <div style={styles.emptyTitle}>This project is empty</div>
            <div style={styles.emptyHint}>
              Press <Kbd>⌘N</Kbd> for a new project, or drop files to start.
            </div>
            <div style={styles.emptyActions}>
              <button
                style={styles.emptyAction}
                onClick={() => handleNewFile("")}
              >
                + New file
              </button>
              <button
                style={styles.emptyAction}
                onClick={() => handleNewFolder("")}
              >
                + New folder
              </button>
            </div>
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
            onContextMenu={(fileId, x, y) => setContextMenu({ kind: "file", fileId, x, y })}
            onContextMenuFolder={(folderPath, x, y) => setContextMenu({ kind: "folder", folderPath, x, y })}
            inputRef={inputRef}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            dropTarget={dropTarget}
            betweenTarget={betweenTarget}
            betweenFolderTarget={betweenFolderTarget}
            selectedFileIds={selectedFileIds}
            onToggleSelect={(id) => setSelectedFileIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            })}
            onClearSelection={() => setSelectedFileIds(new Set())}
            onDragStart={handleDragStart}
            onDragOverFolder={handleDragOverFolder}
            onDropOnFolder={handleDrop}
            onDragOverFile={handleDragOverFile}
            onDropOnFile={handleDropOnFile}
          />
        ))}
      </div>

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onOpenFile={onOpenFile}
          onRenameFile={(id) => {
            const f = files.find((x) => x.id === id);
            if (f) startRename(f);
          }}
          onDeleteFile={handleDelete}
          onDuplicateFile={handleDuplicate}
          onCopyPath={handleCopyPath}
          onBulkDelete={handleBulkDelete}
          selectedFileIds={selectedFileIds}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onToggleFolder={toggleFolder}
          collapsedFolders={collapsedFolders}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />
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
});

// ── Recursive TreeItem ──────────────────────────────────────────────

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  collapsedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onOpenFile: (fileId: string, intent?: { preview?: boolean }) => void;
  activeFileId: string | null;
  editingFileId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onContextMenu: (fileId: string, x: number, y: number) => void;
  onContextMenuFolder: (folderPath: string, x: number, y: number) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onNewFile: (folderPath?: string) => void;
  onNewFolder: (parentPath?: string) => void;
  // Multi-select
  selectedFileIds: Set<string>;
  onToggleSelect: (fileId: string) => void;
  onClearSelection: () => void;
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
              ? "inset 0 2px 0 0 var(--accent-strong)"
              : showFBelow
              ? "inset 0 -2px 0 0 var(--accent-strong)"
              : undefined,
          }}
          onClick={() => props.onToggleFolder(node.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            props.onContextMenuFolder(node.path, e.clientX, e.clientY);
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
  const isSelected = props.selectedFileIds.has(file.id);

  return (
    <div
      data-file-tree-item={file.id}
      data-active-file={isActive ? "true" : "false"}
      data-selected={isSelected ? "true" : "false"}
      draggable={!isEditing}
      onDragStart={(e) => {
        e.stopPropagation();
        props.onDragStart(e, { kind: "file", fileId: file.id });
      }}
      onDragOver={(e) => props.onDragOverFile(e, file.id)}
      onDrop={(e) => props.onDropOnFile(e, file.id)}
      style={{
        ...styles.item,
        ...(isActive || isSelected ? styles.itemActive : {}),
        paddingLeft: 8 + depth * 12,
        position: "relative",
        boxShadow: showAbove
          ? "inset 0 2px 0 0 var(--accent-strong)"
          : showBelow
          ? "inset 0 -2px 0 0 var(--accent-strong)"
          : undefined,
      }}
      onClick={(e) => {
        if (isEditing) return;
        if (e.metaKey || e.ctrlKey) {
          e.stopPropagation();
          props.onToggleSelect(file.id);
          return;
        }
        props.onClearSelection();
        props.onOpenFile(file.id, { preview: true });
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onContextMenu(file.id, e.clientX, e.clientY);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isEditing) {
          props.onClearSelection();
          props.onOpenFile(file.id, { preview: false });
        }
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

// ── Context menu ────────────────────────────────────────────────────

type ContextMenuState =
  | { kind: "file"; fileId: string; x: number; y: number }
  | { kind: "folder"; folderPath: string; x: number; y: number }
  | { kind: "root"; x: number; y: number };

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onOpenFile: (fileId: string, intent?: { preview?: boolean }) => void;
  onRenameFile: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
  onDuplicateFile: (fileId: string) => void;
  onCopyPath: (fileId: string) => void;
  onBulkDelete: () => void;
  selectedFileIds: Set<string>;
  onNewFile: (folderPath?: string) => void;
  onNewFolder: (parentPath?: string) => void;
  onToggleFolder: (folderPath: string) => void;
  collapsedFolders: Set<string>;
  onRenameFolder: (folderPath: string) => void;
  onDeleteFolder: (folderPath: string) => void;
}

// Split nested labels — "New File..." is one item, but we want a
// divider rule between "Open" and "Rename". A `null` entry renders a
// horizontal divider.
type MenuEntry =
  | { label: string; onClick: () => void; danger?: boolean }
  | null;

// Inject a one-time hover-highlight rule for context-menu items.
let ctxMenuStyleInjected = false;
function ensureCtxMenuStyle() {
  if (ctxMenuStyleInjected) return;
  if (typeof document === "undefined") return;
  const el = document.createElement("style");
  el.setAttribute("data-stave-style", "context-menu");
  el.textContent =
    '[data-stave-ctx-item]:hover{background:var(--bg-active);}' +
    '[data-stave-ctx-item][data-danger="true"]:hover{background:var(--danger-hover);}';
  document.head.appendChild(el);
  ctxMenuStyleInjected = true;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        background: "var(--bg-input)",
        border: "1px solid var(--border-strong)",
        borderRadius: 3,
        padding: "1px 5px",
        fontSize: 10,
        fontFamily: '"JetBrains Mono", monospace',
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </kbd>
  );
}

function ContextMenu(props: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: props.state.x, y: props.state.y });
  useEffect(() => { ensureCtxMenuStyle(); }, []);

  // After mount, clamp to viewport so the menu never spills off the
  // right or bottom edge (VS Code behaviour).
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const margin = 4;
    let nx = props.state.x;
    let ny = props.state.y;
    if (nx + rect.width > window.innerWidth - margin) {
      nx = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (ny + rect.height > window.innerHeight - margin) {
      ny = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.state]);

  const entries: MenuEntry[] =
    props.state.kind === "file"
      ? (() => {
          const fileId = (props.state as { fileId: string }).fileId;
          // Bulk mode kicks in when the right-clicked file is part of a
          // multi-selection of >1 items. Surfaces a single 'Delete N'
          // action instead of the per-file menu.
          const isBulk = props.selectedFileIds.size > 1 && props.selectedFileIds.has(fileId);
          if (isBulk) {
            return [
              { label: `Delete ${props.selectedFileIds.size} files`, danger: true,
                onClick: () => props.onBulkDelete() },
            ];
          }
          return [
            { label: "Open", onClick: () => { props.onOpenFile(fileId); props.onClose(); } },
            null,
            { label: "Duplicate", onClick: () => props.onDuplicateFile(fileId) },
            { label: "Copy Path", onClick: () => props.onCopyPath(fileId) },
            null,
            { label: "Rename...", onClick: () => { props.onRenameFile(fileId); props.onClose(); } },
            { label: "Delete", danger: true, onClick: () => props.onDeleteFile(fileId) },
          ];
        })()
      : props.state.kind === "folder"
      ? (() => {
          const fp = (props.state as { folderPath: string }).folderPath;
          const isCollapsed = props.collapsedFolders.has(fp);
          return [
            { label: "New File...", onClick: () => { props.onNewFile(fp); props.onClose(); } },
            { label: "New Folder...", onClick: () => { props.onNewFolder(fp); props.onClose(); } },
            null,
            { label: isCollapsed ? "Expand" : "Collapse", onClick: () => { props.onToggleFolder(fp); props.onClose(); } },
            null,
            { label: "Rename...", onClick: () => props.onRenameFolder(fp) },
            { label: "Delete", danger: true, onClick: () => props.onDeleteFolder(fp) },
          ];
        })()
      : [
          { label: "New File...", onClick: () => { props.onNewFile(""); props.onClose(); } },
          { label: "New Folder...", onClick: () => { props.onNewFolder(""); props.onClose(); } },
        ];

  return (
    <div
      ref={ref}
      style={{ ...styles.contextMenu, left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) =>
        entry === null ? (
          <div key={`div-${i}`} style={styles.menuDivider} />
        ) : (
          <button
            key={entry.label}
            data-stave-ctx-item
            data-danger={entry.danger ? "true" : "false"}
            style={{ ...styles.menuItem, ...(entry.danger ? styles.menuItemDanger : {}) }}
            onClick={entry.onClick}
          >
            {entry.label}
          </button>
        ),
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
    background: "var(--bg-sidebar)",
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column" as const,
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 13,
    color: "var(--text-chrome)",
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
    background: "var(--accent)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    borderBottom: "1px solid var(--border-subtle)",
    gap: 4,
  },
  title: {
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "var(--text-tertiary)",
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
    color: "var(--text-icon)",
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
    padding: "28px 16px",
    textAlign: "center" as const,
    color: "var(--text-muted)",
    fontSize: 12,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  },
  emptyHint: {
    fontSize: 11,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  },
  emptyActions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    marginTop: 6,
    width: "100%",
  },
  emptyAction: {
    background: "var(--bg-active)",
    border: "1px solid var(--border-strong)",
    borderRadius: 4,
    color: "var(--text-primary)",
    padding: "6px 10px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
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
    background: "var(--bg-hover)",
    color: "var(--text-primary)",
    borderLeft: "2px solid var(--accent)",
    paddingLeft: 6, // compensate for the border
  },
  dropTarget: {
    background: "var(--bg-active-strong)",
    outline: "1px dashed var(--accent)",
    outlineOffset: "-1px",
  },
  listDropActive: {
    background: "var(--bg-drag-zone)",
    outline: "1px dashed var(--accent)",
    outlineOffset: "-2px",
  },
  chevron: {
    fontSize: 10,
    width: 10,
    color: "var(--text-muted)",
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
    background: "var(--bg-input)",
    border: "1px solid var(--border-stronger)",
    borderRadius: 3,
    color: "var(--text-primary)",
    fontSize: 13,
    padding: "1px 4px",
    flex: 1,
    outline: "none",
    fontFamily: "inherit",
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
    padding: "6px 14px",
    background: "none",
    border: "none",
    color: "var(--text-chrome)",
    fontSize: 12,
    lineHeight: 1.5,
    textAlign: "left" as const,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  menuItemDanger: {
    color: "var(--danger-fg)",
  },
  menuDivider: {
    height: 1,
    margin: "4px 0",
    background: "var(--border-subtle)",
  },
};
