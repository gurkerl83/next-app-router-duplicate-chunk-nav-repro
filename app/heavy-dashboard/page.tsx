/**
 * Heavy App Router page used by the reproduction.
 *
 * This route uses the ballast-backed chart variant so the payload inflation is
 * explicit instead of being hidden inside the base chart component.
 */

import { ChartWithBallast } from '../../lib/components/chart-with-ballast';

const wrapperShellStyle = {
  margin: '1rem 0',
  border: '2px solid #f59e0b',
  borderRadius: '0.9rem',
  padding: '0.9rem',
  background: '#fffbeb',
  boxShadow: '0 0 0 4px rgba(245, 158, 11, 0.14)'
} as const;

const wrapperLabelStyle = {
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#b45309',
  marginBottom: '0.5rem'
} as const;

export default function HeavyDashboardPage() {
  return (
    <>
      <h1>Heavy Dashboard</h1>
      <p>
        This is a plain App Router page that renders the ballast-backed chart
        variant.
      </p>
      <p>
        This version uses the ballast-backed chart so the same navigation
        pattern can be compared against the small client-component route.
      </p>
      <h2>Revenue Chart</h2>
      <div style={wrapperShellStyle}>
        <div style={wrapperLabelStyle}>Wrapper Trait</div>
        <ChartWithBallast />
      </div>
    </>
  );
}
