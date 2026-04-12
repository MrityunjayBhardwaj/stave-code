import JSZip from "jszip";
import {
  listWorkspaceFiles,
  getFolderOrder,
  type ProjectMeta,
} from "@stave/editor";

interface StaveManifest {
  schemaVersion: 1;
  project: { id: string; name: string; exportedAt: number };
  files: Array<{ id: string; path: string; language: string }>;
  fileOrder: Record<string, string[]>;
}

export async function exportProjectAsZip(project: ProjectMeta): Promise<void> {
  const files = listWorkspaceFiles();
  const zip = new JSZip();

  for (const f of files) {
    zip.file(f.path, f.content);
  }

  // Collect file order for every folder (including root "") that
  // contains at least one file.
  const folderPaths = new Set<string>([""]);
  for (const f of files) {
    const i = f.path.lastIndexOf("/");
    folderPaths.add(i < 0 ? "" : f.path.slice(0, i));
  }
  const fileOrder: Record<string, string[]> = {};
  for (const fp of folderPaths) {
    const order = getFolderOrder(fp);
    if (order.length > 0) fileOrder[fp] = order;
  }

  const manifest: StaveManifest = {
    schemaVersion: 1,
    project: {
      id: project.id,
      name: project.name,
      exportedAt: Date.now(),
    },
    files: files.map((f) => ({ id: f.id, path: f.path, language: f.language })),
    fileOrder,
  };
  zip.file("stave.json", JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const safeName = project.name.replace(/[^a-z0-9_-]+/gi, "_");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName || "stave-project"}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on next tick so the download stream has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
