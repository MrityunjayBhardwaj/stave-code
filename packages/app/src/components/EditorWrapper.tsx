"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { ProjectMeta } from "@stave/editor";

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

/**
 * Bootstrap sequence (runs inside the dynamic import, before any React):
 * 1. Load @stave/editor + StaveApp module
 * 2. Init ProjectRegistry — get last-opened project or create "Untitled"
 * 3. Init the Y.Doc for that project (loads persisted files from IDB)
 * 4. Return StaveApp with the initial project as a prop
 */
export const StrudelEditorDynamic = dynamic(
  () =>
    Promise.all([
      import("./StaveApp"),
      import("@stave/editor"),
      import("../templates"),
    ]).then(async ([staveAppMod, editor, templates]) => {
      const { getLastOpenedProject, createProject, initProjectDoc, touchProject } = editor;
      const { StaveApp } = staveAppMod;
      const { seedProjectFromTemplate, seedMissingPresetFiles } = templates;

      // First-run bootstrap: if no projects exist, create "Untitled" and
      // seed it with the Starter template (so the user sees the default
      // 4-file workspace on their very first visit).
      let project: ProjectMeta | undefined = await getLastOpenedProject();
      let isFirstRun = false;
      if (!project) {
        project = await createProject("Untitled");
        isFirstRun = true;
      }

      // Load the Y.Doc for this project from IDB
      await initProjectDoc(project.id);
      await touchProject(project.id);

      // On first run, seed the Starter template into the empty Y.Doc.
      if (isFirstRun) {
        seedProjectFromTemplate("starter");
      }

      // Ensure bundled viz preset files exist in EVERY session, not just
      // first-run — the shell's tab persistence (#175) may hydrate tabs
      // pointing at these viz fileIds, so they must be in the workspace
      // store BEFORE StaveApp mounts and StrudelEditorClient reads the
      // file list to validate the persisted snapshot. Idempotent via
      // `seedWorkspaceFile`'s create-or-load semantics.
      seedMissingPresetFiles();

      const initialProject = project;

      return function StaveAppWithPreloaderDismiss(props: Record<string, unknown>) {
        return (
          <>
            <HidePreloader />
            <StaveApp {...props} initialProject={initialProject} />
          </>
        );
      };
    }),
  {
    ssr: false,
    loading: () => null, // preloader in layout handles this
  }
);
