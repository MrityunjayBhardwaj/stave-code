"use client";

/**
 * PopoutPreviewController — #240.
 *
 * Headless component (renders null) that owns one pop-out preview window for a
 * compiled viz descriptor. It exists only so the `usePopoutPreview` hook runs
 * inside a React lifecycle: the hook opens `window.open(...)`, mounts the
 * main-thread renderer in the popup, and cleans up on close. Mounted by
 * StrudelEditorClient while a pop-out is active; unmounting (or a null
 * descriptor) closes the window.
 *
 * Live audio is pulled from the WorkspaceAudioBus with `{ kind: 'default' }`
 * (follow most-recent publisher) — same source model the inline preview uses —
 * so the pop-out reacts to whatever pattern is currently playing. The bus
 * fires once per publisher-identity change, not per frame; the hook reaches
 * into `analyser` directly for per-frame FFT (PV: observation, not mutation).
 */

import { useEffect, useState } from "react";
import {
  usePopoutPreview,
  workspaceAudioBus,
  type VizDescriptor,
  type AudioPayload,
  type ResolvedTheme,
} from "@stave/editor";

export function PopoutPreviewController({
  descriptor,
  theme,
  onClose,
}: {
  descriptor: VizDescriptor | null;
  theme: ResolvedTheme;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<AudioPayload | null>(null);

  // Follow the most-recent publisher, like the inline preview's default source.
  useEffect(() => {
    return workspaceAudioBus.subscribe({ kind: "default" }, setPayload);
  }, []);

  usePopoutPreview({
    descriptor,
    hapStream: payload?.hapStream ?? null,
    // AudioPayload carries both a flat `analyser` and a nested `audio.analyser`;
    // prefer the flat slot, fall back to the bag.
    analyser: payload?.analyser ?? payload?.audio?.analyser ?? null,
    scheduler: payload?.scheduler ?? null,
    onClose,
    theme,
  });

  return null;
}
