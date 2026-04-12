/**
 * Root layout for the standalone App Router reproduction.
 *
 * This intentionally mirrors the simple shell used in the larger demo while
 * keeping the app itself focused on one navigation path only.
 */

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

const containerStyle: CSSProperties = {
  maxWidth: '720px',
  margin: '0 auto',
  padding: '2rem',
  fontFamily: 'system-ui, sans-serif'
};

const navStyle: CSSProperties = {
  marginBottom: '2rem',
  paddingBottom: '1rem',
  borderBottom: '1px solid #e5e7eb'
};

const logoLinkStyle: CSSProperties = {
  fontWeight: 'bold',
  textDecoration: 'none',
  color: '#111'
};

function SiteNav() {
  return (
    <nav style={navStyle}>
      <Link href="/" style={logoLinkStyle}>
        App Router Chunk Repro
      </Link>
    </nav>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div style={containerStyle}>
      <SiteNav />
      {children}
    </div>
  );
}

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
