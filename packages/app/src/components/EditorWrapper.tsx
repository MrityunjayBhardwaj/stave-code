"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

function HidePreloader() {
  useEffect(() => {
    const el = document.getElementById("stave-preloader");
    if (el) {
      el.classList.add("hidden");
      setTimeout(() => el.remove(), 300);
    }
  }, []);
  return null;
}

export const StrudelEditorDynamic = dynamic(
  () =>
    Promise.all([
      import("./StrudelEditorClient"),
      // Init the Yjs project doc + load persisted files from IndexedDB
      // BEFORE the editor component mounts. This ensures seedWorkspaceFile
      // sees persisted content and doesn't overwrite it with defaults.
      import("@stave/editor").then(({ initProjectDoc }) =>
        initProjectDoc("default"),
      ),
    ]).then(([mod]) => {
      const Original = mod.default;
      return function EditorWithPreloaderDismiss(props: Record<string, unknown>) {
        return (
          <>
            <HidePreloader />
            <Original {...props} />
          </>
        );
      };
    }),
  {
    ssr: false,
    loading: () => null, // preloader in layout handles this
  }
);
