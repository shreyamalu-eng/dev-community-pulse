import './globals.css';

export const metadata = {
  title: 'Pulse Friday Brief',
  description: "Weekly developer-community pain points for Sumit's sprint planning: what's loud, what's growing, what's unsolved.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
