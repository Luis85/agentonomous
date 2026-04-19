import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../../src/events/DomainEvent.js';
import { SKILL_COMPLETED } from '../../../src/events/standardEvents.js';
import type { Modifier } from '../../../src/modifiers/Modifier.js';
import { Modifiers } from '../../../src/modifiers/Modifiers.js';
import { Needs } from '../../../src/needs/Needs.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';
import { SeededRng } from '../../../src/ports/SeededRng.js';
import { CleanSkill } from '../../../src/skills/defaults/CleanSkill.js';
import { ExpressMeowSkill } from '../../../src/skills/defaults/ExpressMeowSkill.js';
import { ExpressSadSkill } from '../../../src/skills/defaults/ExpressSadSkill.js';
import { ExpressSleepySkill } from '../../../src/skills/defaults/ExpressSleepySkill.js';
import { FeedSkill } from '../../../src/skills/defaults/FeedSkill.js';
import { MedicateSkill } from '../../../src/skills/defaults/MedicateSkill.js';
import { PetSkill } from '../../../src/skills/defaults/PetSkill.js';
import { PlaySkill } from '../../../src/skills/defaults/PlaySkill.js';
import { RestSkill } from '../../../src/skills/defaults/RestSkill.js';
import { ScoldSkill } from '../../../src/skills/defaults/ScoldSkill.js';
import type { SkillContext } from '../../../src/skills/SkillContext.js';

function makeCtx(): {
  ctx: SkillContext;
  needs: Needs;
  modifiers: Modifiers;
  published: DomainEvent[];
  clock: ManualClock;
} {
  const needs = new Needs([
    { id: 'hunger', level: 0.5, decayPerSec: 0 },
    { id: 'cleanliness', level: 0.5, decayPerSec: 0 },
    { id: 'happiness', level: 0.5, decayPerSec: 0 },
    { id: 'energy', level: 0.5, decayPerSec: 0 },
    { id: 'health', level: 1, decayPerSec: 0 },
  ]);
  const modifiers = new Modifiers();
  const published: DomainEvent[] = [];
  const clock = new ManualClock(1000);
  const ctx: SkillContext = {
    identity: { id: 'pet', name: 'Pet', version: '0.0.0', role: 'npc', species: 'cat' },
    clock,
    rng: new SeededRng(0),
    satisfyNeed: (id, amount) => {
      needs.satisfy(id, amount);
    },
    applyModifier: (m) => {
      modifiers.apply(m);
      return m;
    },
    removeModifier: (id) => modifiers.remove(id),
    hasModifier: (id) => modifiers.has(id),
    publishEvent: (e) => {
      published.push(e);
    },
    ageSeconds: () => 0,
  };
  return { ctx, needs, modifiers, published, clock };
}

function applyDisobedient(modifiers: Modifiers): void {
  modifiers.apply({
    id: 'disobedient',
    source: 'test-fixture',
    appliedAt: 0,
    stack: 'replace',
    effects: [],
  });
}

describe('FeedSkill', () => {
  it('raises hunger by 0.6 * effectiveness and applies well-fed modifier', async () => {
    const { ctx, needs, modifiers } = makeCtx();
    const result = await FeedSkill.execute(undefined, ctx);
    expect(result.ok).toBe(true);
    expect(needs.get('hunger')?.level).toBeCloseTo(1); // 0.5 + 0.6 clamped to 1
    expect(modifiers.has('well-fed')).toBe(true);
    if (result.ok) {
      expect(result.value.fxHint).toBe('sparkle-green');
    }
  });

  it('publishes a SkillCompleted event with effectiveness', async () => {
    const { ctx, published } = makeCtx();
    await FeedSkill.execute(undefined, ctx);
    const completed = published.find((e) => e.type === SKILL_COMPLETED);
    expect(completed).toBeDefined();
    expect(completed?.skillId).toBe('feed');
    expect(completed?.effectiveness).toBe(1);
  });
});

describe('CleanSkill', () => {
  it('raises cleanliness by 0.7 * effectiveness', async () => {
    const { ctx, needs } = makeCtx();
    const result = await CleanSkill.execute(undefined, ctx);
    expect(result.ok).toBe(true);
    expect(needs.get('cleanliness')?.level).toBeCloseTo(1); // 0.5 + 0.7 clamped
    if (result.ok) expect(result.value.fxHint).toBe('bubble-blue');
  });

  it('removes the dirty modifier if attached', async () => {
    const { ctx, modifiers } = makeCtx();
    const dirty: Modifier = {
      id: 'dirty',
      source: 'event:got-dirty',
      appliedAt: 0,
      stack: 'replace',
      effects: [],
    };
    modifiers.apply(dirty);
    expect(modifiers.has('dirty')).toBe(true);
    await CleanSkill.execute(undefined, ctx);
    expect(modifiers.has('dirty')).toBe(false);
  });
});

describe('PlaySkill', () => {
  it('bumps happiness, drains energy, applies happy-glow', async () => {
    const { ctx, needs, modifiers } = makeCtx();
    const result = await PlaySkill.execute(undefined, ctx);
    expect(result.ok).toBe(true);
    expect(needs.get('happiness')?.level).toBeCloseTo(1); // 0.5 + 0.5
    expect(needs.get('energy')?.level).toBeCloseTo(0.3); // 0.5 - 0.2
    expect(modifiers.has('happy-glow')).toBe(true);
    if (result.ok) expect(result.value.fxHint).toBe('hearts-pink');
  });
});

describe('RestSkill', () => {
  it('raises energy and slightly drains hunger', async () => {
    const { ctx, needs } = makeCtx();
    const result = await RestSkill.execute(undefined, ctx);
    expect(result.ok).toBe(true);
    expect(needs.get('energy')?.level).toBeCloseTo(1); // 0.5 + 0.8 clamped
    expect(needs.get('hunger')?.level).toBeCloseTo(0.4); // 0.5 - 0.1
    if (result.ok) expect(result.value.fxHint).toBe('zzz');
  });
});

describe('ScoldSkill', () => {
  it('applies scolded modifier and drains happiness when disobedient is present', async () => {
    const { ctx, needs, modifiers } = makeCtx();
    applyDisobedient(modifiers);
    const result = await ScoldSkill.execute(undefined, ctx);
    expect(result.ok).toBe(true);
    expect(modifiers.has('scolded')).toBe(true);
    expect(needs.get('happiness')?.level).toBeCloseTo(0.2); // 0.5 - 0.3
    if (result.ok) expect(result.value.fxHint).toBe('cloud-gray');
  });

  it('returns err("not-misbehaving") when disobedient is absent', async () => {
    const { ctx, modifiers } = makeCtx();
    const result = await ScoldSkill.execute(undefined, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not-misbehaving');
    expect(modifiers.has('scolded')).toBe(false);
  });

  it('clears disobedient on success', async () => {
    const { ctx, modifiers } = makeCtx();
    applyDisobedient(modifiers);
    const result = await ScoldSkill.execute(undefined, ctx);
    expect(result.ok).toBe(true);
    expect(modifiers.has('disobedient')).toBe(false);
  });
});

describe('PetSkill', () => {
  it('raises happiness and applies happy-glow', async () => {
    const { ctx, needs, modifiers } = makeCtx();
    const result = await PetSkill.execute(undefined, ctx);
    expect(result.ok).toBe(true);
    expect(needs.get('happiness')?.level).toBeCloseTo(0.8); // 0.5 + 0.3
    expect(modifiers.has('happy-glow')).toBe(true);
    if (result.ok) expect(result.value.fxHint).toBe('hearts-soft');
  });
});

describe('MedicateSkill', () => {
  it('returns err with code not-sick when no sick modifier attached', async () => {
    const { ctx, needs } = makeCtx();
    const result = await MedicateSkill.execute(undefined, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not-sick');
      expect(result.error.message).toBe('Not sick.');
    }
    // health should not have been touched.
    expect(needs.get('health')?.level).toBe(1);
  });

  it('removes sick modifier and raises health on success', async () => {
    const { ctx, needs, modifiers } = makeCtx();
    needs.satisfy('health', -0.6); // drop health to 0.4.
    const sick: Modifier = {
      id: 'sick',
      source: 'event:illness',
      appliedAt: 0,
      stack: 'replace',
      effects: [],
    };
    modifiers.apply(sick);
    const result = await MedicateSkill.execute(undefined, ctx);
    expect(result.ok).toBe(true);
    expect(modifiers.has('sick')).toBe(false);
    expect(needs.get('health')?.level).toBeCloseTo(0.8); // 0.4 + 0.4
    if (result.ok) expect(result.value.fxHint).toBe('flash-white');
  });
});

describe('ExpressMeowSkill', () => {
  it('publishes ExpressionEmitted with expression=meow', async () => {
    const { ctx, published } = makeCtx();
    const result = await ExpressMeowSkill.execute(undefined, ctx);
    expect(result.ok).toBe(true);
    const expr = published.find((e) => e.type === 'ExpressionEmitted');
    expect(expr).toBeDefined();
    expect(expr?.expression).toBe('meow');
    expect(expr?.agentId).toBe('pet');
    expect(expr?.fxHint).toBe('sound-meow');
    if (result.ok) expect(result.value.fxHint).toBe('sound-meow');
  });
});

describe('ExpressSadSkill', () => {
  it('publishes ExpressionEmitted with expression=sad', async () => {
    const { ctx, published } = makeCtx();
    const result = await ExpressSadSkill.execute(undefined, ctx);
    expect(result.ok).toBe(true);
    const expr = published.find((e) => e.type === 'ExpressionEmitted');
    expect(expr?.expression).toBe('sad');
    expect(expr?.fxHint).toBe('sad-cloud');
    if (result.ok) expect(result.value.fxHint).toBe('sad-cloud');
  });
});

describe('ExpressSleepySkill', () => {
  it('publishes ExpressionEmitted with expression=sleepy', async () => {
    const { ctx, published } = makeCtx();
    const result = await ExpressSleepySkill.execute(undefined, ctx);
    expect(result.ok).toBe(true);
    const expr = published.find((e) => e.type === 'ExpressionEmitted');
    expect(expr?.expression).toBe('sleepy');
    expect(expr?.fxHint).toBe('yawn');
    expect(expr?.at).toBe(1000);
    if (result.ok) expect(result.value.fxHint).toBe('yawn');
  });
});
