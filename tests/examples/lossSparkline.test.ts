// @vitest-environment jsdom
/**
 * Pure-DOM SVG sparkline renderer test. Runs under jsdom; the renderer
 * uses `document.createElementNS` so the SVG namespace must be present —
 * jsdom satisfies this without a real browser.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  clearLossSparkline,
  renderLossSparkline,
} from '../../examples/product-demo/src/lossSparkline.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function renderHost(viewBox = '0 0 120 32'): SVGSVGElement {
  const host = document.createElementNS(SVG_NS, 'svg');
  host.setAttribute('viewBox', viewBox);
  host.setAttribute('width', '120');
  host.setAttribute('height', '32');
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('renderLossSparkline', () => {
  it('renders a polyline with one point per loss sample, plus a baseline', () => {
    const host = renderHost();
    renderLossSparkline(host, [1, 0.5, 0.25, 0.1]);
    const polyline = host.querySelector('polyline.curve');
    expect(polyline).not.toBeNull();
    const points = polyline?.getAttribute('points')?.split(/\s+/) ?? [];
    expect(points).toHaveLength(4);
    expect(host.querySelector('line.axis')).not.toBeNull();
    expect(host.hasAttribute('hidden')).toBe(false);
  });

  it('hides the host when given fewer than 2 points (single-point line is a glitch)', () => {
    const host = renderHost();
    renderLossSparkline(host, []);
    expect(host.hasAttribute('hidden')).toBe(true);
    expect(host.children.length).toBe(0);

    renderLossSparkline(host, [0.5]);
    expect(host.hasAttribute('hidden')).toBe(true);
    expect(host.children.length).toBe(0);
  });

  it('clears prior children on re-render so repeated train clicks do not leak nodes', () => {
    const host = renderHost();
    renderLossSparkline(host, [1, 0.5]);
    expect(host.children.length).toBe(2);
    renderLossSparkline(host, [1, 0.8, 0.4]);
    // 1 baseline + 1 polyline.
    expect(host.children.length).toBe(2);
    const polyline = host.querySelector('polyline.curve');
    expect(polyline?.getAttribute('points')?.split(/\s+/).length).toBe(3);
  });

  it('maps min loss to the bottom of the plot area and max loss to the top', () => {
    const host = renderHost('0 0 100 20');
    renderLossSparkline(host, [1, 0]);
    const points = host.querySelector('polyline.curve')!.getAttribute('points')!.split(/\s+/);
    // First point: y=1 → top; last point: y=0 → bottom.
    const [, y0] = points[0]!.split(',').map(Number) as [number, number];
    const [, y1] = points[1]!.split(',').map(Number) as [number, number];
    expect(y0).toBeLessThan(y1);
  });

  it('handles a flat series (max == min) by drawing a horizontal line', () => {
    const host = renderHost();
    renderLossSparkline(host, [0.3, 0.3, 0.3]);
    const points = host.querySelector('polyline.curve')!.getAttribute('points')!.split(/\s+/);
    const ys = points.map((p) => Number(p.split(',')[1]));
    expect(new Set(ys).size).toBe(1);
  });
});

describe('clearLossSparkline', () => {
  it('removes children and re-hides the host', () => {
    const host = renderHost();
    renderLossSparkline(host, [1, 0.5]);
    expect(host.children.length).toBeGreaterThan(0);
    expect(host.hasAttribute('hidden')).toBe(false);
    clearLossSparkline(host);
    expect(host.children.length).toBe(0);
    expect(host.hasAttribute('hidden')).toBe(true);
  });
});
