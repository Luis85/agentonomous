import type { Agent } from 'agentonomous';
import { resetSimulation } from './ui.js';

const SEED_STORAGE_KEY = 'agentonomous/seed';
const LEGACY_DEFAULT_SEED = 'whiskers';

/**
 * Load the persisted seed or fall back to the legacy default. The
 * default keeps byte-identity with existing saved pets on the first
 * load after this feature ships — players who had a `whiskers` pet
 * before P2 landed reload into the same RNG stream.
 */
export function loadSeed(): string {
  try {
    const stored = globalThis.localStorage?.getItem(SEED_STORAGE_KEY);
    if (typeof stored === 'string' && stored.length > 0) return stored;
  } catch {
    // localStorage unavailable — fall through to default.
  }
  return LEGACY_DEFAULT_SEED;
}

function saveSeed(seed: string): void {
  try {
    globalThis.localStorage?.setItem(SEED_STORAGE_KEY, seed);
  } catch {
    // localStorage unavailable — silently skip. A fresh seed this
    // session is better than nothing; the user can copy it.
  }
}

/**
 * Generate a fresh random seed string. Non-determinism is intentional
 * here — this is the one place a user explicitly asks for a new RNG
 * stream — so `Math.random` + `Date.now` are fair game. The result is
 * short enough to read out loud and long enough to collision-resist.
 */
function generateSeed(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  const stamp = Date.now().toString(36).slice(-4);
  return `${rnd}-${stamp}`;
}

/**
 * Mount the seed controls panel: read-only seed display, Copy, "Reset
 * with new seed", and "Replay this seed". Visibility in the DOM is
 * persistent; the demo chooses whether to show the whole panel.
 *
 * - **Copy seed** writes the current seed to the clipboard (if the
 *   browser supports it).
 * - **Reset with new seed** generates a fresh seed, persists it, then
 *   wipes the pet snapshot and reloads. New pet, new RNG stream.
 * - **Replay this seed** keeps the seed and wipes the snapshot. New
 *   pet, byte-identical RNG stream — a free determinism demo.
 */
export function mountSeedPanel(agent: Agent, currentSeed: string): void {
  const display = document.getElementById('seed-display');
  const copyBtn = document.getElementById('seed-copy');
  const newBtn = document.getElementById('seed-new');
  const replayBtn = document.getElementById('seed-replay');
  if (!display || !copyBtn || !newBtn || !replayBtn) return;

  display.textContent = currentSeed;
  display.setAttribute('title', `Current RNG seed: ${currentSeed}`);

  copyBtn.addEventListener('click', () => {
    const copy = globalThis.navigator?.clipboard?.writeText?.bind(globalThis.navigator.clipboard);
    if (!copy) {
      flash(copyBtn, 'Unsupported');
      return;
    }
    copy(currentSeed).then(
      () => flash(copyBtn, 'Copied!'),
      () => flash(copyBtn, 'Failed'),
    );
  });

  newBtn.addEventListener('click', () => {
    const name = agent.identity.name ?? agent.identity.id;
    const ok = globalThis.confirm?.(
      `Reset ${name} with a new seed? The current pet and its RNG stream will be lost.`,
    );
    if (!ok) return;
    saveSeed(generateSeed());
    resetSimulation(agent.identity.id);
  });

  replayBtn.addEventListener('click', () => {
    const name = agent.identity.name ?? agent.identity.id;
    const ok = globalThis.confirm?.(
      `Replay this seed? ${name}'s current state will be lost, but the RNG stream will be byte-identical from the start.`,
    );
    if (!ok) return;
    // Keep the seed key; resetSimulation only removes the snapshot.
    resetSimulation(agent.identity.id);
  });
}

function flash(btn: HTMLElement, text: string): void {
  const prev = btn.textContent;
  btn.textContent = text;
  globalThis.setTimeout?.(() => {
    btn.textContent = prev;
  }, 1200);
}
