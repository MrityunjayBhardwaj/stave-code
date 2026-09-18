/**
 * #1648 — the stems zip: one WAV per track that has audio, in order, and the
 * silent or failed tracks reported instead of shipped.
 */
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { BouncedStem } from "@stave/editor";
import { buildStemsArchive, stemDisplayName } from "../stemsArchive";

class FakeSilent extends Error {}
const isSilent = (e: unknown) => e instanceof FakeSilent;

const wav = (tag: string) => new Blob([`RIFF-${tag}`]);
const stem = (fileName: string, over: Partial<BouncedStem>): BouncedStem => ({
  id: fileName,
  fileName,
  haps: 1,
  skipped: [],
  ...over,
});

describe("buildStemsArchive (#1648)", () => {
  it("puts each stem with audio in the zip under its file name, in order, byte for byte", async () => {
    const out = await buildStemsArchive(
      [
        stem("01-drums.wav", { blob: wav("drums") }),
        stem("02-d2.wav", { error: new FakeSilent("silent") }),
        stem("03-song-level.wav", { blob: wav("song") }),
      ],
      isSilent,
    );
    const zip = await JSZip.loadAsync(out.zip);
    const names = Object.keys(zip.files);
    expect(names).toEqual(["01-drums.wav", "03-song-level.wav"]);
    expect(await zip.file("01-drums.wav")!.async("string")).toBe("RIFF-drums");
    expect(out.included).toEqual(["01-drums.wav", "03-song-level.wav"]);
    expect(out.silent).toEqual(["02-d2.wav"]);
    expect(out.failed).toEqual([]);
  });

  it("a stem that failed for another reason is reported as failed, not silent", async () => {
    const boom = new Error("render failed");
    const out = await buildStemsArchive([stem("01-a.wav", { error: boom })], isSilent);
    expect(out.silent).toEqual([]);
    expect(out.failed).toEqual([{ fileName: "01-a.wav", error: boom }]);
  });

  it("names a stem for a message without its number or extension", () => {
    expect(stemDisplayName("03-song-level.wav")).toBe("song-level");
  });
});
