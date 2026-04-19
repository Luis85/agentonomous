import { defineSpecies, type SpeciesDescriptor } from 'agentonomous';

const CONFIG_STORAGE_KEY = 'agentonomous/species-config';

/**
 * Flat, user-facing override shape. Mirrors the subset of
 * `SpeciesDescriptor` the config panel exposes for editing. Kept
 * separate from the library type so the v1 demo's editable surface can
 * evolve without a library version bump.
 */
export interface EditableSpeciesConfig {
  needs: Record<string, { decayPerSec: number }>;
  persona: { traits: Record<string, number> };
  lifecycle: { schedule: Record<string, number> };
}

/**
 * Extract the editable subset from a `SpeciesDescriptor`. Used to seed
 * the textarea contents both on first mount and after a "Reset to
 * defaults" click.
 */
export function currentEditableConfig(descriptor: SpeciesDescriptor): EditableSpeciesConfig {
  const needs: EditableSpeciesConfig['needs'] = {};
  for (const n of descriptor.needs ?? []) {
    needs[n.id] = { decayPerSec: n.decayPerSec };
  }
  const traits: Record<string, number> = {};
  for (const [k, v] of Object.entries(descriptor.persona?.traits ?? {})) {
    if (typeof v === 'number') traits[k] = v;
  }
  const schedule: Record<string, number> = {};
  for (const entry of descriptor.lifecycle?.schedule ?? []) {
    schedule[entry.stage] = entry.atSeconds;
  }
  return { needs, persona: { traits }, lifecycle: { schedule } };
}

type ValidationResult = { ok: true; config: EditableSpeciesConfig } | { ok: false; error: string };

/**
 * Validate a raw string from the textarea. Returns the parsed config on
 * success, or a human-readable error string on failure. Shape is
 * forgiving: unknown keys are tolerated (no-op at apply time); known
 * keys must have the correct primitive type and stay within sensible
 * bounds (non-negative finite decay / atSeconds, traits in [0, 1]).
 */
export function validateEditableConfig(raw: string, base: SpeciesDescriptor): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `JSON parse error: ${(err as Error).message}` };
  }
  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, error: 'Top-level value must be a JSON object.' };
  }

  const baseNeedIds = new Set((base.needs ?? []).map((n) => n.id));
  const baseStageIds = new Set((base.lifecycle?.schedule ?? []).map((e) => e.stage));

  const obj = parsed as Record<string, unknown>;
  const needs: Record<string, { decayPerSec: number }> = {};
  const traits: Record<string, number> = {};
  const schedule: Record<string, number> = {};

  if (obj['needs'] !== undefined) {
    if (obj['needs'] === null || typeof obj['needs'] !== 'object') {
      return { ok: false, error: '`needs` must be an object keyed by need id.' };
    }
    for (const [id, value] of Object.entries(obj['needs'] as Record<string, unknown>)) {
      if (!baseNeedIds.has(id)) {
        return {
          ok: false,
          error: `Unknown need id "${id}". Valid: ${[...baseNeedIds].join(', ')}.`,
        };
      }
      if (value === null || typeof value !== 'object') {
        return { ok: false, error: `needs.${id} must be an object.` };
      }
      const rate = (value as Record<string, unknown>)['decayPerSec'];
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
        return {
          ok: false,
          error: `needs.${id}.decayPerSec must be a finite number ≥ 0 (got ${String(rate)}).`,
        };
      }
      needs[id] = { decayPerSec: rate };
    }
  }

  if (obj['persona'] !== undefined) {
    const persona = obj['persona'];
    if (persona === null || typeof persona !== 'object') {
      return { ok: false, error: '`persona` must be an object.' };
    }
    const rawTraits = (persona as Record<string, unknown>)['traits'];
    if (rawTraits !== undefined) {
      if (rawTraits === null || typeof rawTraits !== 'object') {
        return { ok: false, error: '`persona.traits` must be an object.' };
      }
      for (const [k, v] of Object.entries(rawTraits as Record<string, unknown>)) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
          return {
            ok: false,
            error: `persona.traits.${k} must be a finite number in [0, 1] (got ${String(v)}).`,
          };
        }
        traits[k] = v;
      }
    }
  }

  if (obj['lifecycle'] !== undefined) {
    const lifecycle = obj['lifecycle'];
    if (lifecycle === null || typeof lifecycle !== 'object') {
      return { ok: false, error: '`lifecycle` must be an object.' };
    }
    const rawSchedule = (lifecycle as Record<string, unknown>)['schedule'];
    if (rawSchedule !== undefined) {
      if (rawSchedule === null || typeof rawSchedule !== 'object') {
        return { ok: false, error: '`lifecycle.schedule` must be an object keyed by stage.' };
      }
      for (const [stage, at] of Object.entries(rawSchedule as Record<string, unknown>)) {
        if (!baseStageIds.has(stage)) {
          return {
            ok: false,
            error: `Unknown lifecycle stage "${stage}". Valid: ${[...baseStageIds].join(', ')}.`,
          };
        }
        if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) {
          return {
            ok: false,
            error: `lifecycle.schedule.${stage} must be a finite number ≥ 0 (got ${String(at)}).`,
          };
        }
        schedule[stage] = at;
      }
      // Ordering check: the merged schedule must stay monotonic non-decreasing.
      const merged = (base.lifecycle?.schedule ?? []).map((e) => ({
        stage: e.stage,
        atSeconds: schedule[e.stage] ?? e.atSeconds,
      }));
      for (let i = 1; i < merged.length; i++) {
        const prev = merged[i - 1]!;
        const curr = merged[i]!;
        if (curr.atSeconds < prev.atSeconds) {
          return {
            ok: false,
            error: `lifecycle.schedule must be monotonic: "${curr.stage}" (${curr.atSeconds}) before "${prev.stage}" (${prev.atSeconds}).`,
          };
        }
      }
    }
  }

  return { ok: true, config: { needs, persona: { traits }, lifecycle: { schedule } } };
}

/**
 * Merge an override onto a base `SpeciesDescriptor`, producing a new
 * descriptor suitable for `createAgent({ species })`. Only fields named
 * in the override are replaced; everything else (displayName, allowed
 * skills, appearance, capabilities, etc.) flows through from the base.
 */
export function applyOverride(
  base: SpeciesDescriptor,
  override: EditableSpeciesConfig,
): SpeciesDescriptor {
  const nextNeeds = (base.needs ?? []).map((n) => {
    const patch = override.needs[n.id];
    if (!patch) return n;
    return { ...n, decayPerSec: patch.decayPerSec };
  });

  const baseTraits = base.persona?.traits ?? {};
  const nextTraits = { ...baseTraits, ...override.persona.traits };

  const nextSchedule = (base.lifecycle?.schedule ?? []).map((e) => {
    const at = override.lifecycle.schedule[e.stage];
    if (at === undefined) return e;
    return { ...e, atSeconds: at };
  });

  return defineSpecies({
    ...base,
    needs: nextNeeds,
    persona: { ...base.persona, traits: nextTraits },
    lifecycle: {
      ...base.lifecycle,
      schedule: nextSchedule,
    },
  });
}

/**
 * Read a persisted override from localStorage and validate its shape
 * against `base` before returning it. Malformed, stale, or
 * schema-incompatible stored values fall back to `null` (defaults) so a
 * bad blob can't crash `applyOverride` at startup.
 */
export function loadConfigOverride(base: SpeciesDescriptor): EditableSpeciesConfig | null {
  try {
    const raw = globalThis.localStorage?.getItem(CONFIG_STORAGE_KEY);
    if (typeof raw !== 'string' || raw.length === 0) return null;
    const result = validateEditableConfig(raw, base);
    return result.ok ? result.config : null;
  } catch {
    return null;
  }
}

function saveConfigOverride(cfg: EditableSpeciesConfig): void {
  try {
    globalThis.localStorage?.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // localStorage full / unavailable — surface via alert at call site.
  }
}

function clearConfigOverride(): void {
  try {
    globalThis.localStorage?.removeItem(CONFIG_STORAGE_KEY);
  } catch {
    // nothing to clean up if storage is unavailable
  }
}

const PANEL_VISIBLE_KEY = 'agentonomous/species-config-visible';

/**
 * Mount the species-config panel: a collapsible textarea pre-populated
 * with the effective editable subset of the current species, plus Apply
 * and Reset-to-defaults buttons. Apply validates the JSON, persists the
 * override, and triggers a full-page reset via the `onApply` callback so
 * the agent is rebuilt with the new descriptor from a clean slate.
 *
 * Validation errors surface inline in the status line; on success, the
 * panel calls `onApply()` — callers typically pipe this into
 * `resetSimulation(id)` so the reload picks up the stored override.
 */
export function mountConfigPanel(
  base: SpeciesDescriptor,
  effective: EditableSpeciesConfig,
  onApply: () => void,
): void {
  const root = document.getElementById('species-config');
  const toggle = document.getElementById('species-config-toggle');
  const textarea = document.getElementById('species-config-textarea');
  const status = document.getElementById('species-config-status');
  const applyBtn = document.getElementById('species-config-apply');
  const resetBtn = document.getElementById('species-config-reset');
  if (
    !root ||
    !toggle ||
    !(textarea instanceof HTMLTextAreaElement) ||
    !status ||
    !applyBtn ||
    !resetBtn
  )
    return;

  const defaults = currentEditableConfig(base);
  textarea.value = JSON.stringify(effective, null, 2);

  const initialVisible = globalThis.localStorage?.getItem(PANEL_VISIBLE_KEY) === 'true';
  setVisible(root, toggle, initialVisible);

  toggle.addEventListener('click', () => {
    const next = root.getAttribute('data-visible') !== 'true';
    setVisible(root, toggle, next);
    try {
      globalThis.localStorage?.setItem(PANEL_VISIBLE_KEY, next ? 'true' : 'false');
    } catch {
      // non-fatal — toggle still works for this session.
    }
  });

  applyBtn.addEventListener('click', () => {
    const result = validateEditableConfig(textarea.value, base);
    if (!result.ok) {
      setStatus(status, result.error, 'error');
      return;
    }
    saveConfigOverride(result.config);
    setStatus(status, 'Saved — reloading…', 'ok');
    onApply();
  });

  resetBtn.addEventListener('click', () => {
    textarea.value = JSON.stringify(defaults, null, 2);
    clearConfigOverride();
    setStatus(status, 'Reset to defaults — reloading…', 'ok');
    onApply();
  });
}

function setVisible(root: HTMLElement, toggle: HTMLElement, visible: boolean): void {
  root.setAttribute('data-visible', visible ? 'true' : 'false');
  toggle.textContent = visible ? 'Hide species config' : 'Show species config';
  toggle.setAttribute('aria-expanded', visible ? 'true' : 'false');
}

function setStatus(el: HTMLElement, text: string, kind: 'ok' | 'error'): void {
  el.textContent = text;
  el.setAttribute('data-kind', kind);
}
