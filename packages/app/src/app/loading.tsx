export default function Loading() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#090912",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      }}
    >
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
      <p
        style={{
          color: "rgba(255,255,255,0.35)",
          fontSize: 13,
          marginTop: 8,
        }}
      >
        Loading editor…
      </p>
      <div
        style={{
          marginTop: 24,
          width: 40,
          height: 40,
          border: "3px solid rgba(196, 181, 253, 0.15)",
          borderTop: "3px solid #c4b5fd",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </main>
  );
}
