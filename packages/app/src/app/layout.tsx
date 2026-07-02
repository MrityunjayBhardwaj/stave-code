import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stave — Engine-agnostic live coding editor",
  description:
    "Engine-agnostic live coding editor — any engine, any viz, any synth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ height: "100%" }} suppressHydrationWarning>
      <head>
        {/* Set data-stave-theme before first paint so CSS vars resolve
            immediately — prevents a dark flash when the user chose light. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('stave:editorTheme') || 'dark';
                  var resolved = t === 'light' ? 'light'
                    : t === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
                    : 'dark';
                  document.documentElement.setAttribute('data-stave-theme', resolved);
                } catch (e) {}
              })();
            `,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @keyframes spin { to { transform: rotate(360deg) } }
              @keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }
              #stave-preloader {
                position: fixed; inset: 0; z-index: 9999;
                background: var(--bg-app);
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                font-family: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
                transition: opacity 0.3s ease-out;
              }
              #stave-preloader.hidden { opacity: 0; pointer-events: none; }
              #stave-preloader h1 {
                font-size: 32px; font-weight: 700; color: var(--accent-strong);
                margin: 0; letter-spacing: -0.5px;
              }
              #stave-preloader .status {
                color: var(--text-secondary); font-size: 13px; margin-top: 12px;
                animation: pulse 2s ease-in-out infinite;
              }
              #stave-preloader .spinner {
                margin-top: 24px; width: 36px; height: 36px;
                border: 3px solid var(--border-subtle);
                border-top-color: var(--accent-strong); border-radius: 50%;
                animation: spin 0.8s linear infinite;
              }
            `,
          }}
        />
        {/* SuperSonic loaded dynamically in SonicPiEngine — no script tag needed */}
      </head>
      <body style={{ minHeight: "100%", display: "flex", flexDirection: "column", margin: 0, background: "var(--bg-app)" }}>
        {/* Static shell shown before any JS runs. The `.status` line is
            updated live by the bootstrap (EditorWrapper) to reflect the real
            phase — loading the workspace, opening the project, preparing the
            editor — instead of fake timed step labels. */}
        <div id="stave-preloader">
          <h1>Stave</h1>
          <div className="status" id="stave-preloader-status">Starting up…</div>
          <div className="spinner" />
        </div>
        {children}
      </body>
    </html>
  );
}
