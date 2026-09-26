"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  collectUnusedSounds,
  getStorageStatus,
  retryDocSave,
  subscribeStorageStatus,
} from "@stave/editor";

import {
  formatBytes,
  freedNotYetSavedMessage,
  freeSpaceMessage,
} from "../assetLibrary/freeSpaceMessages";

/**
 * How long "Free space" keeps trying to save after it freed something, and
 * how often. The room a delete frees is not usable at once: Chromium removed a
 * deleted blob's file 4–30 s later (4 runs, 2026-09-26), and a save before
 * that is refused as if nothing had been freed.
 */
const SAVE_AFTER_FREE_MS = 90_000;
const SAVE_RETRY_EVERY_MS = 3_000;

/** What the Free space action is doing, or what it last found. */
type FreeState =
  | { readonly phase: "idle" }
  | { readonly phase: "freeing" }
  | { readonly phase: "saving"; readonly bytes: number }
  | { readonly phase: "said"; readonly text: string; readonly openLibrary: boolean };

/**
 * "Storage is full" — the one notice every refused write leads to (#1779, E2E-6).
 *
 * Before this, a full disk had no answer: sounds read "Added", takes vanished,
 * and typed code was gone on reload, each silently (measured 2026-09-25). Every
 * store now reports a refusal to `storageStatus` (#1777, #1778), and this is
 * where it is said — once, in words that name what is not saved and what to do.
 *
 * ## Why it cannot be dismissed
 *
 * The state it reports is not an event that passes. While it holds, what the
 * user is making is not being kept, and a notice they can close is a notice
 * they will have closed by the time it matters. It goes away when a write
 * COMMITS (`retryDocSave`), which is the only evidence that there is room again.
 *
 * ## The next steps, and why these two
 *
 * - **Export project** — the zip is a download, which needs no browser
 *   storage, so the work can be got out first whatever else happens.
 * - **Try again** — writes the whole document once. It is also how the notice
 *   learns the user has freed room: success clears it.
 * - **Free space** (#1787) — deletes the bytes of sounds no project uses
 *   (`collectUnusedSounds`), then keeps trying to save until the browser lets
 *   the room be used, which clears the notice. When there is nothing unused it
 *   says so and offers the Library, where each of your sounds shows its size.
 *   Every outcome says what happened; "couldn't check" and "the browser
 *   refused" never read as "nothing to free".
 */
export function StorageFullNotice({
  onExport,
  onOpenLibrary,
}: {
  onExport: () => void;
  /** Open the Library on your own sounds (sizes shown). */
  onOpenLibrary: () => void;
}) {
  const status = useSyncExternalStore(
    subscribeStorageStatus,
    getStorageStatus,
    getStorageStatus,
  );
  const [stillFull, setStillFull] = useState(false);
  const [trying, setTrying] = useState(false);
  const [free, setFree] = useState<FreeState>({ phase: "idle" });
  // The retry loop outlives a render; it stops when the notice unmounts
  // (the save went through) or a newer Free space starts.
  const freeRun = useRef(0);
  useEffect(() => () => {
    freeRun.current++;
  }, []);

  // Leaving the page while the document is behind loses those edits for good:
  // they exist only in memory. The browser's own prompt is the one a user
  // cannot miss on the way out.
  useEffect(() => {
    if (!status.documentUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status.documentUnsaved]);

  // A fresh refusal resets the "still full" hint from an earlier try.
  useEffect(() => setStillFull(false), [status.fullSince]);

  const tryAgain = useCallback(async () => {
    setTrying(true);
    try {
      const saved = await retryDocSave();
      setStillFull(!saved);
    } catch (err) {
      console.warn("[stave] retry save failed:", err);
      setStillFull(true);
    } finally {
      setTrying(false);
    }
  }, []);

  const freeSpace = useCallback(async () => {
    const run = ++freeRun.current;
    setFree({ phase: "freeing" });
    let result;
    try {
      result = await collectUnusedSounds();
    } catch (err) {
      console.warn("[stave] free space failed:", err);
      if (run === freeRun.current) {
        setFree({ phase: "said", text: "Couldn't free space. See the console for details.", openLibrary: false });
      }
      return;
    }
    if (run !== freeRun.current) return;
    if (result.kind !== "freed") {
      setFree({
        phase: "said",
        text: freeSpaceMessage(result),
        openLibrary: result.kind === "nothing-unused",
      });
      return;
    }
    setFree({ phase: "saving", bytes: result.bytes });
    const deadline = Date.now() + SAVE_AFTER_FREE_MS;
    while (Date.now() < deadline) {
      let saved = false;
      try {
        saved = await retryDocSave();
      } catch (err) {
        console.warn("[stave] save after freeing failed:", err);
      }
      // A committed save clears the storage status, and this notice with it.
      if (saved || run !== freeRun.current) return;
      await new Promise((r) => setTimeout(r, SAVE_RETRY_EVERY_MS));
      if (run !== freeRun.current) return;
    }
    setFree({ phase: "said", text: freedNotYetSavedMessage(result.bytes), openLibrary: false });
  }, []);

  if (status.fullSince === null) return null;

  const since = new Date(status.fullSince).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const what = status.documentUnsaved
    ? `changes since ${since} are not saved`
    // Not "what you added": the refused write may be one the user never made
    // (boot's last-opened stamp is refused on a full disk too), so the notice
    // says what is TRUE whichever door refused.
    : "Stave can't save anything new right now";

  return (
    <div
      role="alert"
      data-storage-full
      data-storage-full-unsaved={status.documentUnsaved ? "true" : "false"}
      style={styles.box}
    >
      <span style={styles.text}>
        ⚠ <strong>Storage is full</strong> — {what}. Export the project to keep
        a copy, or free space and try again.
        {stillFull && free.phase === "idle" && (
          <span data-storage-full-still style={{ display: "block", marginTop: 4 }}>
            Still full — nothing was saved.
          </span>
        )}
        {free.phase === "saving" && (
          <span data-storage-full-freed style={{ display: "block", marginTop: 4 }}>
            Freed {formatBytes(free.bytes)}. Saving as soon as the browser releases the room…
          </span>
        )}
        {free.phase === "said" && (
          <span data-storage-full-free-result style={{ display: "block", marginTop: 4 }}>
            {free.text}
          </span>
        )}
      </span>
      <div style={styles.actions}>
        {free.phase === "said" && free.openLibrary && (
          <button type="button" style={styles.button} onClick={onOpenLibrary} data-storage-full-library>
            Open Library
          </button>
        )}
        <button
          type="button"
          style={styles.button}
          onClick={() => void freeSpace()}
          disabled={free.phase === "freeing" || free.phase === "saving"}
          data-storage-full-free
        >
          {free.phase === "freeing" ? "Freeing…" : free.phase === "saving" ? "Saving…" : "Free space"}
        </button>
        <button type="button" style={styles.button} onClick={onExport} data-storage-full-export>
          Export project
        </button>
        <button
          type="button"
          style={styles.button}
          onClick={() => void tryAgain()}
          disabled={trying}
          data-storage-full-retry
        >
          {trying ? "Saving…" : "Try again"}
        </button>
      </div>
    </div>
  );
}

// Same surface as the temporary-session notice in EditorWrapper, so the two
// storage warnings read as one family.
const styles = {
  box: {
    position: "fixed",
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10000,
    maxWidth: 620,
    display: "flex",
    // With four actions a single row squeezed the message into a column
    // ~130 px wide (seen 2026-09-26); the text keeps a readable width and the
    // buttons wrap onto the next line instead.
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--bg-elevated, #2a2a2a)",
    border: "1px solid var(--border-strong, #444)",
    color: "var(--text-primary, #eee)",
    fontFamily: "var(--font-mono), ui-monospace, monospace",
    fontSize: 12,
    boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
  },
  text: {
    lineHeight: 1.4,
    flex: "1 1 320px",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
  button: {
    flexShrink: 0,
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid var(--accent-strong, #6ab)",
    background: "transparent",
    color: "var(--accent-strong, #6ab)",
    cursor: "pointer",
    font: "inherit",
  },
} as const;
