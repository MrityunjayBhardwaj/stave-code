import { StrudelEditorDynamic } from "../components/EditorWrapper";

export default function Home() {
  return (
    <main
      style={{
        height: "100dvh",
        width: "100%",
        background: "var(--bg-app)",
        display: "flex",
        flexDirection: "column",
        fontFamily: 'var(--font-mono), ui-monospace, monospace',
        overflow: "hidden",
      }}
    >
      <StrudelEditorDynamic />
    </main>
  );
}
