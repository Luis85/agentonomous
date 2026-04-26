/**
 * Pure-DOM SVG sparkline of a training-loss curve. Renders into the
 * supplied `<svg>` host using the SVG namespace; no charting library.
 *
 * Layout: 1px-padded plot area inside the host's viewBox. The polyline
 * spans the full width; y-axis is auto-fit between min and max of the
 * input series. A horizontal baseline at the min value anchors the
 * reader's eye when loss plateaus.
 *
 * Idempotent: each call clears prior children before drawing, so the
 * caller can re-invoke after every train run without leaking nodes.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const PADDING = 2;

export interface RenderLossSparklineOptions {
  /** Override the curve color. Defaults to the CSS class `.curve` styling. */
  color?: string;
}

/**
 * Renders `losses` into `host`. Hides the host (sets `hidden`) when
 * the series is empty or has fewer than 2 points — a single-point line
 * is just a dot and looks like a glitch.
 */
export function renderLossSparkline(
  host: SVGSVGElement,
  losses: readonly number[],
  opts: RenderLossSparklineOptions = {},
): void {
  while (host.firstChild) host.removeChild(host.firstChild);

  if (losses.length < 2) {
    host.setAttribute('hidden', '');
    return;
  }
  host.removeAttribute('hidden');

  const { width, height } = readViewBox(host);
  const plotW = Math.max(1, width - 2 * PADDING);
  const plotH = Math.max(1, height - 2 * PADDING);

  const min = Math.min(...losses);
  const max = Math.max(...losses);
  const span = max - min;

  const xStep = plotW / (losses.length - 1);
  const points = losses
    .map((y, i) => {
      const xPx = PADDING + i * xStep;
      const norm = span === 0 ? 0.5 : (y - min) / span;
      const yPx = PADDING + (1 - norm) * plotH;
      return `${xPx.toFixed(2)},${yPx.toFixed(2)}`;
    })
    .join(' ');

  const baseline = document.createElementNS(SVG_NS, 'line');
  baseline.setAttribute('class', 'axis');
  baseline.setAttribute('x1', String(PADDING));
  baseline.setAttribute('x2', String(PADDING + plotW));
  baseline.setAttribute('y1', String(PADDING + plotH));
  baseline.setAttribute('y2', String(PADDING + plotH));
  host.appendChild(baseline);

  const curve = document.createElementNS(SVG_NS, 'polyline');
  curve.setAttribute('class', 'curve');
  curve.setAttribute('points', points);
  if (opts.color !== undefined) curve.setAttribute('stroke', opts.color);
  host.appendChild(curve);

  host.setAttribute(
    'aria-label',
    `Training loss curve: ${losses.length} epochs, final ${max.toPrecision(3)} → ${losses[losses.length - 1]?.toPrecision(3) ?? '?'}`,
  );
}

/** Clears the sparkline and hides the host. */
export function clearLossSparkline(host: SVGSVGElement): void {
  while (host.firstChild) host.removeChild(host.firstChild);
  host.setAttribute('hidden', '');
}

function readViewBox(host: SVGSVGElement): { width: number; height: number } {
  const vb = host.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { width: parts[2] as number, height: parts[3] as number };
    }
  }
  const widthAttr = Number(host.getAttribute('width') ?? 120);
  const heightAttr = Number(host.getAttribute('height') ?? 32);
  return { width: widthAttr, height: heightAttr };
}
