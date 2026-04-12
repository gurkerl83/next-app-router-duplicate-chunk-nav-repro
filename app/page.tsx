/**
 * Landing page with a negative control plus two client-side comparison targets.
 *
 * Keeping the landing page intentionally small makes it easier to compare the
 * production client transition into an inline no-import route, a light shared
 * client-component route, and a ballast-backed client route.
 */

import type { CSSProperties } from 'react';
import Link from 'next/link';

type RouteKind = 'inline' | 'light' | 'heavy';

const kindColors: Record<
  RouteKind,
  { border: string; bg: string; text: string }
> = {
  inline: { border: '#d1d5db', bg: '#f3f4f6', text: '#6b7280' },
  light: { border: '#2563eb', bg: '#dbeafe', text: '#1d4ed8' },
  heavy: { border: '#f59e0b', bg: '#fef3c7', text: '#92400e' },
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
};

const cardStyle = (kind: RouteKind): CSSProperties => ({
  display: 'block',
  padding: '1rem',
  border: `2px solid ${kindColors[kind].border}`,
  borderRadius: '0.5rem',
  textDecoration: 'none',
  color: 'inherit',
});

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
};

const badgeStyle = (kind: RouteKind): CSSProperties => ({
  fontSize: '0.75rem',
  padding: '0.125rem 0.5rem',
  borderRadius: '9999px',
  background: kindColors[kind].bg,
  color: kindColors[kind].text,
});

const descriptionStyle: CSSProperties = {
  margin: '0.25rem 0 0',
  fontSize: '0.875rem',
  color: '#6b7280',
};

export default function Home() {
  return (
    <>
      <h1>App Router Duplicate Chunk Navigation Repro</h1>
      <p>
        This app contains one inline baseline plus two imported-component
        comparison routes so the production transition behavior can be compared
        side by side.
      </p>
      <div style={gridStyle}>
        <Link
          href="/inline-dashboard"
          // In the App Router, `prefetch={false}` disables automatic prefetching;
          // the navigation remains a clean click-driven transition for debugging.
          prefetch={false}
          style={cardStyle('inline')}
        >
          <div style={cardHeaderStyle}>
            <strong>Open Inline Dashboard</strong>
            <span style={badgeStyle('inline')}>inline</span>
          </div>
          <p style={descriptionStyle}>
            No shared <code>{'<Chart />'}</code> import. The page renders the
            comparison markup inline.
          </p>
        </Link>
        <Link
          href="/light-dashboard"
          // In the App Router, `prefetch={false}` disables automatic prefetching;
          // the navigation remains a clean click-driven transition for debugging.
          prefetch={false}
          style={cardStyle('light')}
        >
          <div style={cardHeaderStyle}>
            <strong>Open Light Dashboard</strong>
            <span style={badgeStyle('light')}>light</span>
          </div>
          <p style={descriptionStyle}>
            Imports the shared <code>{'<Chart />'}</code> client component with
            no ballast.
          </p>
        </Link>
        <Link
          href="/heavy-dashboard"
          // In the App Router, `prefetch={false}` disables automatic prefetching;
          // the navigation remains a clean click-driven transition for debugging.
          prefetch={false}
          style={cardStyle('heavy')}
        >
          <div style={cardHeaderStyle}>
            <strong>Open Heavy Dashboard</strong>
            <span style={badgeStyle('heavy')}>heavy</span>
          </div>
          <p style={descriptionStyle}>
            Ballast-backed version of the same imported-chart pattern so the
            duplicate load cost becomes much more visible.
          </p>
        </Link>
      </div>
    </>
  );
}
