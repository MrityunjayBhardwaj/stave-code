"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  getStorageStatus,
  retryDocSave,
  subscribeStorageStatus,
} from "@stave/editor";

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
 *
 * Freeing room INSIDE Stave (removing sounds) does not exist yet — #1780.
 */
export function StorageFullNotice({ onExport }: { onExport: () => void }) {
  const status = useSyncExternalStore(
    subscribeStorageStatus,
    getStorageStatus,
    getStorageStatus,
  );
  const [stillFull, setStillFull] = useState(false);
  const [trying, setTrying] = useState(false);

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
      <span style={{ lineHeight: 1.4 }}>
        ⚠ <strong>Storage is full</strong> — {what}. Export the project to keep
        a copy, or free space in your browser and try again.
        {stillFull && (
          <span data-storage-full-still style={{ display: "block", marginTop: 4 }}>
            Still full — nothing was saved.
          </span>
        )}
      </span>
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
