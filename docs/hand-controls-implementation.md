# hand controls implementation

## phases and checks

1. verify the pinned runtime and real model in a dedicated worker. record unsupported browsers rather than adding a main-thread fallback.
2. implement the pure timestamped gesture state machine and synthetic behavior tests.
3. implement camera lifecycle, permission and failure states, preview, and pause/stop.
4. connect camera transforms and node picking through the existing renderer and click handler. place the flight guide and camera in one dock.
5. test lifecycle failures, gestures, graph changes, responsive layout, and teardown. run type checking and a production build.
6. measure five alternating feature-off and feature-on runs against the existing 121-node fixture. record limitations and leave real-hand validation explicit.

## throughput checkpoint

three writers own separate boundaries. the gesture writer owns types and interpretation; the runtime writer owns the worker, session, and panel; the graph writer owns camera adaptation and the guide integration. the coordinator owns pinned assets, research, browser checks, and performance evidence. no writer owns another writer's files. the shared types are settled before integration.

## status

implementation and automated verification are complete. acceptance evidence is recorded in `hand-controls-validation.md`. native safari, edge, and real-hand release checks remain unverified.
