/**
 * Base chart component for the comparison routes.
 *
 * This version intentionally has no synthetic ballast. It lets us compare a
 * normal small client component against the ballast-backed variant.
 */

'use client';

import { useState } from 'react';

const data = [
  { label: 'Jan', value: 65 },
  { label: 'Feb', value: 78 },
  { label: 'Mar', value: 90 },
  { label: 'Apr', value: 81 },
  { label: 'May', value: 95 },
  { label: 'Jun', value: 110 },
];

const maxValue = Math.max(...data.map(d => d.value));

export function Chart() {
  const [selectedLabel, setSelectedLabel] = useState('Jun');

  return (
    <div
      style={{
        padding: '1.5rem',
        border: '2px solid #10b981',
        borderRadius: '0.5rem',
        background: '#ecfdf5',
        margin: '1rem 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '0.5rem',
          height: '150px',
        }}
      >
        {data.map(d => (
          <button
            key={d.label}
            type="button"
            onClick={() => setSelectedLabel(d.label)}
            style={{
              flex: 1,
              textAlign: 'center',
              border: 'none',
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                background: d.label === selectedLabel ? '#059669' : '#10b981',
                borderRadius: '0.25rem 0.25rem 0 0',
                height: `${(d.value / maxValue) * 120}px`,
                transition: 'height 0.3s',
              }}
            />
            <div
              style={{
                fontSize: '0.75rem',
                marginTop: '0.25rem',
                color: '#6b7280',
              }}
            >
              {d.label}
            </div>
          </button>
        ))}
      </div>
      <p
        style={{
          fontSize: '0.75rem',
          color: '#6b7280',
          marginTop: '0.75rem',
          textAlign: 'center',
        }}
      >
        Selected month: <strong>{selectedLabel}</strong>
      </p>
    </div>
  );
}
