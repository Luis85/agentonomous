---
'agentonomous': patch
---

Fix: route `AgentFacade.publishEvent` through the internal publish path so
reactive-handler and module-onInstall events appear in the tick trace's
`emitted` list and are observed by the autosave event-trigger tracker.

Previously the facade wrote straight to `eventBus.publish`, bypassing
`emittedThisTick` and `AutoSaveTracker.observeEvent`. Subscribers saw the
event but the `DecisionTrace` did not, and event-gated autosaves never
fired for facade-published types. The fix unifies the facade with the
existing skill-context publish path — no public API change.
