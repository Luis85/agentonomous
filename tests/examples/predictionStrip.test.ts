// @vitest-environment jsdom
/**
 * Pure-DOM SVG prediction-strip renderer test. Runs under jsdom; the
 * renderer uses `document.createElementNS` so the SVG namespace must
 * be present.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  clearPredictionStrip,
  renderPredictionStrip,
} from '../../examples/nurture-pet/src/predictionStrip.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SOFTMAX_DIM = 7;

function renderHost(): SVGSVGElement {
  const host = document.createElementNS(SVG_NS, 'svg');
  host.setAttribute('viewBox', '0 0 200 60');
  host.setAttribute('width', '200');
  host.setAttribute('height', '60');
  document.body.appendChild(host);
  return host;
}

function uniformOutput(): number[] {
  return new Array<number>(SOFTMAX_DIM).fill(1 / SOFTMAX_DIM);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('renderPredictionStrip', () => {
  it('renders one bar + one label per softmax column plus a threshold line', () => {
    const host = renderHost();
    renderPredictionStrip(host, uniformOutput(), { threshold: 0.2 });
    expect(host.querySelectorAll('rect.prediction-bar').length).toBe(SOFTMAX_DIM);
    expect(host.querySelectorAll('text.prediction-label').length).toBe(SOFTMAX_DIM);
    expect(host.querySelectorAll('line.threshold').length).toBe(1);
    expect(host.hasAttribute('hidden')).toBe(false);
  });

  it('hides the host when output is null (no forward pass yet)', () => {
    const host = renderHost();
    renderPredictionStrip(host, null, { threshold: 0.2 });
    expect(host.hasAttribute('hidden')).toBe(true);
    expect(host.children.length).toBe(0);
  });

  it('hides the host when output width does not match SOFTMAX_DIM', () => {
    const host = renderHost();
    renderPredictionStrip(host, [0.1, 0.9], { threshold: 0.2 });
    expect(host.hasAttribute('hidden')).toBe(true);
    expect(host.children.length).toBe(0);
  });

  it('clears prior children on re-render so per-tick repaints do not leak nodes', () => {
    const host = renderHost();
    renderPredictionStrip(host, uniformOutput(), { threshold: 0.2 });
    const initialCount = host.children.length;
    renderPredictionStrip(host, uniformOutput(), { threshold: 0.2 });
    expect(host.children.length).toBe(initialCount);
  });

  it('flags the selected column with the .selected class', () => {
    const host = renderHost();
    const out = new Array<number>(SOFTMAX_DIM).fill(0.05);
    out[3] = 0.7;
    renderPredictionStrip(host, out, { threshold: 0.2, selectedIdx: 3 });
    const bars = Array.from(host.querySelectorAll('rect.prediction-bar'));
    const selectedCount = bars.filter((b) => b.classList.contains('selected')).length;
    expect(selectedCount).toBe(1);
    expect(bars[3]?.classList.contains('selected')).toBe(true);
  });

  it('places the threshold line at threshold * plot height below the baseline', () => {
    const host = renderHost();
    renderPredictionStrip(host, uniformOutput(), { threshold: 0.5 });
    const line = host.querySelector('line.threshold');
    const y1 = Number(line?.getAttribute('y1') ?? NaN);
    // Baseline at y=50, top at y=4, plotH = 46. threshold=0.5 → y = 50 - 23 = 27.
    expect(y1).toBeCloseTo(27, 1);
  });

  it('renders bar height proportional to the column probability', () => {
    const host = renderHost();
    const out = new Array<number>(SOFTMAX_DIM).fill(0);
    out[0] = 1.0;
    out[6] = 0.0;
    renderPredictionStrip(host, out, { threshold: 0.2 });
    const bars = Array.from(host.querySelectorAll('rect.prediction-bar'));
    const h0 = Number(bars[0]?.getAttribute('height') ?? NaN);
    const h6 = Number(bars[6]?.getAttribute('height') ?? NaN);
    expect(h0).toBeGreaterThan(h6);
    expect(h6).toBeCloseTo(0, 1);
  });

  it('clamps probabilities outside [0, 1] to the displayable range', () => {
    const host = renderHost();
    const out = new Array<number>(SOFTMAX_DIM).fill(0);
    out[0] = 1.5;
    out[1] = -0.4;
    out[2] = Number.NaN;
    renderPredictionStrip(host, out, { threshold: 0.2 });
    const bars = Array.from(host.querySelectorAll('rect.prediction-bar'));
    const h0 = Number(bars[0]?.getAttribute('height') ?? NaN);
    const h1 = Number(bars[1]?.getAttribute('height') ?? NaN);
    const h2 = Number(bars[2]?.getAttribute('height') ?? NaN);
    expect(h0).toBeLessThanOrEqual(46);
    expect(h1).toBeCloseTo(0, 1);
    expect(h2).toBeCloseTo(0, 1);
  });
});

describe('clearPredictionStrip', () => {
  it('removes children and re-hides the host', () => {
    const host = renderHost();
    renderPredictionStrip(host, uniformOutput(), { threshold: 0.2 });
    expect(host.children.length).toBeGreaterThan(0);
    expect(host.hasAttribute('hidden')).toBe(false);
    clearPredictionStrip(host);
    expect(host.children.length).toBe(0);
    expect(host.hasAttribute('hidden')).toBe(true);
  });
});
