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
    import("./StrudelEditorClient").then((mod) => {
      // Return a wrapper that hides the preloader on mount
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
