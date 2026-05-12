import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Fitnesstracker - Adaptive Calorie Cut",
  description:
    "71-day adaptive calorie tracker: 102kg to 90kg with phase-based deficit planning",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
              html { font-size: 16px; -webkit-font-smoothing: antialiased; }
              body {
                font-family: 'IBM Plex Sans', sans-serif;
                background: var(--bg, #0f172a);
                color: var(--text, #e2e8f0);
                min-height: 100vh;
                transition: background 0.3s ease, color 0.3s ease;
              }
              input[type="number"] {
                font-family: 'JetBrains Mono', monospace;
                background: var(--input-bg, #0f172a);
                border: 1px solid var(--input-border, #475569);
                color: var(--text, #e2e8f0);
                border-radius: 6px;
                padding: 6px 10px;
                font-size: 14px;
                width: 100%;
                outline: none;
                transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease;
              }
              input[type="number"]:focus { border-color: #60a5fa; }
              input[type="number"]::-webkit-inner-spin-button { opacity: 1; }
              button { cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; }
              @keyframes confetti-fall {
                0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
                100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
