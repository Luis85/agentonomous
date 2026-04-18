import type { Agent, AgentState } from 'agentonomous';

const NEEDS: { id: string; label: string }[] = [
  { id: 'hunger', label: 'Hunger' },
  { id: 'cleanliness', label: 'Cleanliness' },
  { id: 'happiness', label: 'Happiness' },
  { id: 'energy', label: 'Energy' },
  { id: 'health', label: 'Health' },
];

const INTERACTION_BUTTONS: { verb: string; label: string }[] = [
  { verb: 'feed', label: '🍖 Feed' },
  { verb: 'clean', label: '🫧 Clean' },
  { verb: 'play', label: '🎾 Play' },
  { verb: 'rest', label: '💤 Rest' },
  { verb: 'pet', label: '❤️ Pet' },
  { verb: 'medicate', label: '💊 Medicate' },
  { verb: 'scold', label: '😠 Scold' },
];

export function mountHud(agent: Agent): { update: (state: AgentState) => void } {
  const bars = document.getElementById('bars') as HTMLElement;
  const modifiersEl = document.getElementById('modifier-list') as HTMLElement;
  const buttonsEl = document.getElementById('buttons') as HTMLElement;
  const trace = document.getElementById('trace') as HTMLElement;
  const petEl = document.getElementById('pet') as HTMLElement;
  const nameEl = document.getElementById('pet-name') as HTMLElement;
  const stageEl = document.getElementById('pet-stage') as HTMLElement;
  const ageEl = document.getElementById('pet-age') as HTMLElement;
  const moodEl = document.getElementById('pet-mood') as HTMLElement;
  const animEl = document.getElementById('pet-animation') as HTMLElement;

  // Build need bars
  for (const need of NEEDS) {
    const row = document.createElement('div');
    row.className = 'bar';
    row.innerHTML = `
      <span>${need.label}</span>
      <div class="bar-track"><div class="bar-fill" data-need="${need.id}" style="width: 100%"></div></div>
      <span class="bar-value" data-need-value="${need.id}">1.00</span>
    `;
    bars.appendChild(row);
  }

  // Build interaction buttons
  for (const def of INTERACTION_BUTTONS) {
    const btn = document.createElement('button');
    btn.textContent = def.label;
    btn.addEventListener('click', () => {
      agent.interact(def.verb);
    });
    buttonsEl.appendChild(btn);
  }

  // Recent-event log (trimmed tail)
  const traceLines: string[] = [];
  agent.subscribe((event) => {
    traceLines.push(
      `${new Date(event.at).toISOString().slice(11, 19)}  ${event.type}${
        typeof event.agentId === 'string' ? ` (${event.agentId})` : ''
      }`,
    );
    if (traceLines.length > 40) traceLines.shift();
    trace.textContent = traceLines.join('\n');
  });

  nameEl.textContent = agent.identity.name;

  return {
    update(state: AgentState): void {
      stageEl.textContent = `stage: ${state.stage}`;
      ageEl.textContent = `age: ${state.ageSeconds.toFixed(1)}s`;
      moodEl.textContent = `mood: ${state.mood?.category ?? '—'}`;
      animEl.textContent = `anim: ${state.animation}`;

      for (const need of NEEDS) {
        const level = state.needs[need.id] ?? 0;
        const fill = document.querySelector<HTMLElement>(`[data-need="${need.id}"]`);
        const value = document.querySelector<HTMLElement>(`[data-need-value="${need.id}"]`);
        if (fill) {
          fill.style.width = `${Math.max(0, Math.min(100, level * 100))}%`;
          fill.classList.toggle('critical', level < 0.25);
        }
        if (value) value.textContent = level.toFixed(2);
      }

      modifiersEl.innerHTML = '';
      for (const mod of state.modifiers) {
        const li = document.createElement('li');
        li.textContent = mod.id;
        modifiersEl.appendChild(li);
      }

      // Halt / animation visual cue
      if (state.halted) {
        petEl.textContent = '💀';
        petEl.style.background = '#475569';
      } else if (state.animation === 'sleeping') {
        petEl.textContent = '😴';
        petEl.style.background = '#93c5fd';
      } else if (state.animation === 'eating') {
        petEl.textContent = '😋';
        petEl.style.background = '#fcd34d';
      } else if (state.animation === 'sick') {
        petEl.textContent = '🤒';
        petEl.style.background = '#d1d5db';
      } else if (state.mood?.category === 'sad') {
        petEl.textContent = '😢';
        petEl.style.background = '#bfdbfe';
      } else if (state.mood?.category === 'playful') {
        petEl.textContent = '😺';
        petEl.style.background = '#fde68a';
      } else {
        petEl.textContent = '🐱';
        petEl.style.background = '#fde68a';
      }
    },
  };
}
