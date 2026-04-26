/**
 * Pure-DOM SVG strip rendering Learning mode's per-tick softmax
 * distribution as a row of vertical bars (one per
 * `SOFTMAX_SKILL_IDS` column) with a horizontal threshold line at
 * `IDLE_THRESHOLD`. Visualizes WHY the pet idled vs. acted this tick:
 * if no bar crosses the threshold the pet idled; otherwise the
 * highest bar (= argmax) is the chosen action. Pure renderer with no
 * charting library — same pattern as `lossSparkline.ts`.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Short 2-char labels for each `SOFTMAX_SKILL_IDS` column. */
const SHORT_LABELS = ['Fd', 'Cl', 'Pl', 'Rs', 'Pt', 'Md', 'Sc'] as const;

const VIEW_W = 200;
const VIEW_H = 60;
const PAD_X = 4;
const TOP_Y = 4;
const BASELINE_Y = 50;
const LABEL_Y = 58;

export interface RenderPredictionStripOptions {
  /**
   * Idle floor as a probability in `[0, 1]`. Drawn as a horizontal
   * dashed line across the bar columns. Bars whose top sits below
   * this line correspond to columns the `interpret()` gate would
   * idle out of.
   */
  threshold: number;
  /**
   * Index of the column the `interpret()` gate selected this tick, or
   * `null` if the pet idled. Highlighted with the `selected` CSS
   * class so the chosen action stands out from the rest.
   */
  selectedIdx?: number | null;
}

/**
 * Render `output` (one probability per `SOFTMAX_SKILL_IDS` column)
 * into `host`. Idempotent: clears prior children before drawing.
 *
 * Hides the host (sets `hidden`) when `output` is null or has the
 * wrong width — Learning mode hasn't run a forward pass yet on this
 * tick, or the consumer wired a topology mismatch the strip can't
 * sensibly render.
 */
export function renderPredictionStrip(
  host: SVGSVGElement,
  output: number[] | null,
  opts: RenderPredictionStripOptions,
): void {
  while (host.firstChild) host.removeChild(host.firstChild);

  if (output === null || output.length !== SHORT_LABELS.length) {
    host.setAttribute('hidden', '');
    return;
  }
  host.removeAttribute('hidden');

  const plotW = VIEW_W - 2 * PAD_X;
  const plotH = BASELINE_Y - TOP_Y;
  const colCount = SHORT_LABELS.length;
  const gap = 3;
  const colW = (plotW - gap * (colCount - 1)) / colCount;
  const thresholdY = BASELINE_Y - opts.threshold * plotH;
  const selectedIdx = opts.selectedIdx ?? null;

  // Threshold line first so bars layer over it. Dashed so it's
  // distinguishable from the solid bar tops at a glance.
  const threshold = document.createElementNS(SVG_NS, 'line');
  threshold.setAttribute('class', 'threshold');
  threshold.setAttribute('x1', String(PAD_X));
  threshold.setAttribute('x2', String(PAD_X + plotW));
  threshold.setAttribute('y1', thresholdY.toFixed(2));
  threshold.setAttribute('y2', thresholdY.toFixed(2));
  host.appendChild(threshold);

  for (let i = 0; i < colCount; i++) {
    const prob = clamp01(output[i] ?? 0);
    const barH = prob * plotH;
    const x = PAD_X + i * (colW + gap);
    const y = BASELINE_Y - barH;

    const bar = document.createElementNS(SVG_NS, 'rect');
    const isSelected = selectedIdx === i;
    bar.setAttribute('class', isSelected ? 'prediction-bar selected' : 'prediction-bar');
    bar.setAttribute('x', x.toFixed(2));
    bar.setAttribute('y', y.toFixed(2));
    bar.setAttribute('width', colW.toFixed(2));
    bar.setAttribute('height', Math.max(0, barH).toFixed(2));
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${SHORT_LABELS[i] ?? '??'}: ${(prob * 100).toFixed(1)}%`;
    bar.appendChild(title);
    host.appendChild(bar);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('class', 'prediction-label');
    label.setAttribute('x', (x + colW / 2).toFixed(2));
    label.setAttribute('y', String(LABEL_Y));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = SHORT_LABELS[i] ?? '??';
    host.appendChild(label);
  }

  host.setAttribute(
    'aria-label',
    `Softmax prediction strip — selected: ${
      selectedIdx === null ? 'idle' : (SHORT_LABELS[selectedIdx] ?? '??')
    }, threshold ${(opts.threshold * 100).toFixed(0)}%`,
  );
}

/** Clears the strip and hides the host. */
export function clearPredictionStrip(host: SVGSVGElement): void {
  while (host.firstChild) host.removeChild(host.firstChild);
  host.setAttribute('hidden', '');
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
