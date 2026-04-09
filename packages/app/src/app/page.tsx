import { StrudelEditorDynamic } from "../components/EditorWrapper";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#090912",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 24px",
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      }}
    >
      <header style={{ marginBottom: 32, textAlign: "center" }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#c4b5fd",
            margin: 0,
            letterSpacing: "-0.5px",
          }}
        >
          Stave
        </h1>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 4 }}>
          Pattern code + Viz code. One workspace.
        </p>
      </header>

      <div style={{ width: "100%", maxWidth: 860 }}>
        <StrudelEditorDynamic />
      </div>

      <footer
        style={{
          marginTop: 32,
          color: "rgba(255,255,255,0.2)",
          fontSize: 11,
          textAlign: "center",
        }}
      >
        Ctrl+Enter to play · Ctrl+. to stop · Ctrl+S saves viz preset · Drag tabs between groups
      </footer>
    </main>
  );
}
