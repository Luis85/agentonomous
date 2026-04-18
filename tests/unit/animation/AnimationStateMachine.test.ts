import { describe, expect, it } from 'vitest';
import { AnimationStateMachine } from '../../../src/animation/AnimationStateMachine.js';
import { Modifiers } from '../../../src/modifiers/Modifiers.js';

describe('AnimationStateMachine', () => {
  it('defaults to idle and reports current()', () => {
    const sm = new AnimationStateMachine();
    expect(sm.current()).toBe('idle');
  });

  it('reconcile follows mood when no skill / modifier drives', () => {
    const sm = new AnimationStateMachine();
    const t = sm.reconcile({ mood: 'sad', modifiers: new Modifiers(), wallNowMs: 100 });
    expect(t?.to).toBe('sad');
    expect(sm.current()).toBe('sad');
  });

  it('active skill map wins over mood', () => {
    const sm = new AnimationStateMachine({ skillMap: { feed: 'eating' } });
    const t = sm.reconcile({
      activeSkillId: 'feed',
      mood: 'sad',
      modifiers: new Modifiers(),
      wallNowMs: 10,
    });
    expect(t?.to).toBe('eating');
    expect(t?.reason).toBe('skill:feed');
  });

  it('modifier overrides win over skill and mood', () => {
    const sm = new AnimationStateMachine();
    const mods = new Modifiers();
    mods.apply({
      id: 'sick',
      source: 'event:illness',
      appliedAt: 0,
      stack: 'replace',
      effects: [],
    });
    const t = sm.reconcile({
      activeSkillId: 'play',
      mood: 'happy',
      modifiers: mods,
      wallNowMs: 5,
    });
    expect(t?.to).toBe('sick');
    expect(t?.reason).toBe('modifier:sick');
  });

  it('reconcile returns null if no state change', () => {
    const sm = new AnimationStateMachine();
    sm.reconcile({ mood: 'sad', modifiers: new Modifiers(), wallNowMs: 0 });
    const second = sm.reconcile({ mood: 'sad', modifiers: new Modifiers(), wallNowMs: 1 });
    expect(second).toBeNull();
  });

  it('explicit transition() bypasses reconciliation and records history', () => {
    const sm = new AnimationStateMachine();
    const t = sm.transition('dead', 'deceased');
    expect(t?.to).toBe('dead');
    expect(sm.history()).toHaveLength(1);
    expect(sm.history()[0]?.reason).toBe('deceased');
  });

  it('history accumulates transitions', () => {
    const sm = new AnimationStateMachine();
    sm.transition('happy');
    sm.transition('playing');
    sm.transition('idle');
    expect(sm.history().map((t) => t.to)).toEqual(['happy', 'playing', 'idle']);
  });

  it('snapshot + restore preserves state', () => {
    const sm = new AnimationStateMachine();
    sm.transition('playing');
    const snap = sm.snapshot();

    const copy = new AnimationStateMachine();
    copy.restore(snap);
    expect(copy.current()).toBe('playing');
  });

  it('supports consumer-defined moodMap overrides', () => {
    const sm = new AnimationStateMachine({ moodMap: { angry: 'snarling' } });
    const t = sm.reconcile({ mood: 'angry', modifiers: new Modifiers(), wallNowMs: 0 });
    expect(t?.to).toBe('snarling');
  });
});
