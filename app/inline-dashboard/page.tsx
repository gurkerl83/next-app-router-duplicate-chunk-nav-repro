/**
 * Inline App Router comparison page.
 *
 * This route avoids importing the shared `Chart` client component and instead
 * renders equivalent chart-like markup directly in the server page.
 */

const months = [
  { label: 'Jan', value: 65 },
  { label: 'Feb', value: 78 },
  { label: 'Mar', value: 90 },
  { label: 'Apr', value: 81 },
  { label: 'May', value: 95 },
  { label: 'Jun', value: 110 }
] as const;

const rows = [
  { id: 1, date: '2025-03-15', description: 'Widget Pro', amount: '$249.00' },
  { id: 2, date: '2025-03-14', description: 'Starter Plan', amount: '$29.00' },
  {
    id: 3,
    date: '2025-03-14',
    description: 'Enterprise License',
    amount: '$1,499.00'
  },
  { id: 4, date: '2025-03-13', description: 'Widget Pro', amount: '$249.00' },
  { id: 5, date: '2025-03-12', description: 'Team Plan', amount: '$99.00' }
] as const;

const maxValue = Math.max(...months.map(month => month.value));

export default function InlineDashboardPage() {
  return (
    <>
      <h1>Inline Dashboard</h1>
      <p>
        This route is the no-import comparison baseline. It does not import the
        shared <code>{'<Chart />'}</code> client component.
      </p>
      <p>
        Instead, it renders equivalent chart-like markup directly in the page
        so we can compare that baseline against the imported light and
        ballast-backed variants.
      </p>
      <h2>Revenue Summary</h2>
      <div
        style={{
          margin: '1rem 0',
          border: '2px solid #d1d5db',
          borderRadius: '0.9rem',
          padding: '0.9rem',
          background: '#f9fafb'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '0.5rem',
            height: '150px'
          }}
        >
          {months.map(month => (
            <div key={month.label} style={{ flex: 1, textAlign: 'center' }}>
              <div
                style={{
                  background: '#9ca3af',
                  borderRadius: '0.25rem 0.25rem 0 0',
                  height: `${(month.value / maxValue) * 120}px`
                }}
              />
              <div
                style={{
                  fontSize: '0.75rem',
                  marginTop: '0.25rem',
                  color: '#6b7280'
                }}
              >
                {month.label}
              </div>
            </div>
          ))}
        </div>
      </div>
      <h2>Recent Transactions</h2>
      <div
        style={{
          border: '2px solid #d1d5db',
          borderRadius: '0.5rem',
          background: '#fff',
          margin: '1rem 0',
          overflow: 'hidden'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th
                style={{
                  padding: '0.5rem 1rem',
                  borderBottom: '1px solid #e5e7eb',
                  textAlign: 'left'
                }}
              >
                Date
              </th>
              <th
                style={{
                  padding: '0.5rem 1rem',
                  borderBottom: '1px solid #e5e7eb',
                  textAlign: 'left'
                }}
              >
                Description
              </th>
              <th
                style={{
                  padding: '0.5rem 1rem',
                  borderBottom: '1px solid #e5e7eb',
                  textAlign: 'right'
                }}
              >
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td
                  style={{
                    padding: '0.5rem 1rem',
                    borderBottom: '1px solid #e5e7eb',
                    textAlign: 'left'
                  }}
                >
                  {row.date}
                </td>
                <td
                  style={{
                    padding: '0.5rem 1rem',
                    borderBottom: '1px solid #e5e7eb',
                    textAlign: 'left'
                  }}
                >
                  {row.description}
                </td>
                <td
                  style={{
                    padding: '0.5rem 1rem',
                    borderBottom: '1px solid #e5e7eb',
                    textAlign: 'right',
                    fontFamily: 'monospace'
                  }}
                >
                  {row.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
