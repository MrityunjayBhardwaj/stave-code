import JSZip from "jszip";
import type { BouncedStem } from "@stave/editor";

/**
 * #1648 — a stems export arrives as ONE zip: a WAV per track, named as the mixer
 * names the track and numbered in document order, so the folder reads the way the
 * song does. One download rather than one per track, which a browser may refuse
 * or ask about for each file after the first.
 *
 * Only stems with audio go in. What was left out is reported by the caller, so a
 * silent track is named rather than shipped as a file of zeros.
 *
 * `isSilent` is injected rather than imported: the `@stave/editor` barrel drags
 * a CJS dependency into app unit tests (the type import above is erased).
 */
export interface StemsArchive {
  zip: Blob;
  /** File names in the zip, in order. */
  included: string[];
  /** Tracks with no file: silent in this span, or failed. */
  silent: string[];
  failed: Array<{ fileName: string; error: unknown }>;
}

export async function buildStemsArchive(
  stems: readonly BouncedStem[],
  isSilent: (error: unknown) => boolean,
): Promise<StemsArchive> {
  const zip = new JSZip();
  const included: string[] = [];
  const silent: string[] = [];
  const failed: StemsArchive["failed"] = [];
  for (const stem of stems) {
    if (stem.blob) {
      zip.file(stem.fileName, stem.blob);
      included.push(stem.fileName);
    } else if (isSilent(stem.error)) {
      silent.push(stem.fileName);
    } else {
      failed.push({ fileName: stem.fileName, error: stem.error });
    }
  }
  // STORE, not DEFLATE: PCM barely compresses, and deflating minutes of audio
  // per track costs seconds for a few percent.
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  return { zip: blob, included, silent, failed };
}

/** `01-drums.wav` → `drums`, for a message a person reads. */
export function stemDisplayName(fileName: string): string {
  return fileName.replace(/^\d+-/, "").replace(/\.wav$/, "");
}
