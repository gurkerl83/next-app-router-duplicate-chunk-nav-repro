/**
 * Light App Router comparison page.
 *
 * This route imports the small shared `Chart` client component without any
 * synthetic ballast.
 */

import { Chart } from '../../lib/components/chart';

const wrapperShellStyle = {
  margin: '1rem 0',
  border: '2px solid #2563eb',
  borderRadius: '0.9rem',
  padding: '0.9rem',
  background: '#eff6ff',
  boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.14)'
} as const;

const wrapperLabelStyle = {
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#1d4ed8',
  marginBottom: '0.5rem'
} as const;

export default function LightDashboardPage() {
  return (
    <>
      <h1>Light Dashboard</h1>
      <p>
        This is a plain App Router page that imports the small shared{' '}
        <code>{'<Chart />'}</code> client component.
      </p>
      <p>
        It exists to compare an ordinary client-component route against the
        inline baseline and the ballast-backed variant.
      </p>
      <h2>Revenue Chart</h2>
      <div style={wrapperShellStyle}>
        <div style={wrapperLabelStyle}>Shared Client Component</div>
        <Chart />
      </div>
    </>
  );
}
