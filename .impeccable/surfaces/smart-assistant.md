# Habil Smart-Assistant Surface Brief

Status: implemented Phase 6

Seed key: `local-extension/no-concept-roll` — this route extends an established application world and therefore did not run a replacement-world concept tournament.

Build path for this session: code-led. This is not stored as a project-wide default.

## Direction Contract

### 1. World

An operational recommendation workspace inside the existing Habil dashboard: solid surfaces, dense but readable evidence, restrained indigo emphasis, Inter typography, and Lucide line icons.

### 2. First Viewport

The operator immediately sees what the system is, that it is rule-based/read-only, the available business scopes, the active rule check, and the highest-priority recommendation with evidence.

### 3. Operator Path

Choose a scope → optionally add context → run deterministic rules → inspect severity/reason/evidence → navigate to the owning business module. Loading, empty, success, and error states preserve the same path.

### 4. Signature Interaction

The scope control is the primary mechanism. It uses radio semantics, roving tabindex, and Arrow/Home/End navigation. Context text never changes the declared data boundary or creates unsupported facts.

### 5. Honest Risk

An assistant-shaped feature can accidentally imply generative AI. Copy, progress language, input labels, metadata, and result structure must continually state that this is a bounded rule engine and that the operator makes the decision.

## Quality Bar

| Dimension | Required evidence |
|---|---|
| Trust | “Rule-based smart suggestions”, non-generative disclosure, read-only verification, and operator caveat are visible without opening help. |
| Explainability | Every recommendation has severity, reason, numerical evidence, and a destination action. |
| Accessibility | Semantic radiogroup, roving keyboard navigation, ≥3:1 focus indicator, ≥4.5:1 small status text, reduced motion, and live state announcements. |
| Responsive behavior | No horizontal overflow at 390 px, input text remains 16 px, all actions are at least 44 px, and the mobile menu sits on an opaque safe app bar. |
| Visual integration | Uses existing tokens and component language; glass/blur appears only on the mobile app-bar safety layer. |
| Performance | Route is lazy-loaded; no AI SDK, Python, vector store, or additional frontend dependency is introduced. |
