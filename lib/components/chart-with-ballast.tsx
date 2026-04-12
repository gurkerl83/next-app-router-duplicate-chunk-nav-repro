/**
 * Ballast-backed chart wrapper.
 *
 * This route-level variant keeps the base chart unchanged and adds the
 * synthetic ballast import only where we want to study the amplified cost.
 */

'use client';

import { Chart } from './chart';
import { BALLAST_DATA } from './chart-ballast';

export function ChartWithBallast() {
  return (
    <div data-ballast={JSON.stringify(BALLAST_DATA).length}>
      <Chart />
    </div>
  );
}
