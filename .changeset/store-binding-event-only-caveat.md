---
'agentonomous': patch
---

Document that `bindAgentToStore` is event-driven only — its listener does
not fire on silent per-tick state changes (needs decay, age advance,
modifier countdown). JSDoc now explicitly steers consumers toward
combining the subscription with a `requestAnimationFrame` loop that
reads `agent.getState()` every frame for a smoothly-animated HUD.
