import { createWorkspaceFile, type WorkspaceFile } from "@stave/editor";
import { showPrompt, showToast } from "../dialogs/host";

/**
 * Map a (lower-cased) file extension to a workspace language. Single source
 * of truth for the set of extensions Stave can create — shared by the file
 * tree (New File button + drag-drop import) and the editor tab-bar "+"
 * (issue #612). Returns null for an unrecognized extension.
 */
export function extensionToLanguage(ext: string): WorkspaceFile["language"] | null {
  switch (ext) {
    case "strudel": return "strudel";
    case "sonicpi":
    case "rb": return "sonicpi";
    case "hydra":
    case "hy": return "hydra";
    case "p5":
    case "p5js":
    case "js": return "p5js";
    case "glsl":
    case "frag":
    case "shader": return "glsl";
    case "md": return "markdown";
    default: return null;
  }
}

/**
 * Prompt the user for a file name and create the file at `folderPath`
 * (root when empty). The single new-file flow behind both the file tree's
 * "New File" button and the editor tab-bar "+" (issue #612) so the two
 * affordances stay byte-for-byte identical — same prompt copy, same
 * supported-extension validation, same toast on an unknown extension.
 */
export async function promptAndCreateFile(folderPath = ""): Promise<void> {
  const name = await showPrompt({
    title: "New file",
    description: "Include an extension — .strudel, .sonicpi, .hydra, .p5, .glsl, or .md.",
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
      `Unknown file extension ".${ext}". Supported: .strudel, .sonicpi, .hydra, .p5, .glsl, .md`,
      "error",
    );
    return;
  }
  const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  createWorkspaceFile(id, path, "", language);
}
