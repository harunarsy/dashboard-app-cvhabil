# Product

<!-- impeccable:product-schema 1 -->

Facts in this record come from the owner-approved modernization brief and repository source of truth as of 23 August 2026.

## Platform

web

## Users

- Operations admins managing purchase orders, purchase invoices, sales, inventory, customers, distributors, and marketplace data.
- Directors reviewing the full operational and financial view.
- Tax consultants have a deliberately isolated tax-only role and do not receive general operational access.

## Product Purpose

Habil SuperApp is the operational source of truth for CV Habil Sejahtera Bersama. It joins order, invoice, inventory, customer, sales, and financial workflows in one dashboard so operators can act from consistent PostgreSQL data instead of reconciling disconnected documents.

Success means routine work is fast, explainable, auditable, and does not silently change business data outside explicit operator actions.

## Positioning

The product combines transaction entry with batch-aware inventory and deterministic business recommendations derived from the same operational records. Its Smart-Assistant exposes the reason and evidence behind each suggestion rather than presenting opaque generated answers.

## Operating Context

- Desktop is the primary dense operating surface; mobile web supports review and focused actions.
- PostgreSQL is the master source of truth. PDFs and reports are regenerated artifacts.
- Operators work with Indonesian business terminology, Rupiah values, product units, batches, expiry dates, distributor invoices, sales notes, and customer follow-up.
- Production transport is REST/HTTP request-response.

## Capabilities and Constraints

- React 19 frontend with Vite 8 and local Tailwind CSS 4.
- Express 5 backend with PostgreSQL through `pg`; Node 24.19.0 LTS is the default runtime and Bun 1.4 remains a parallel pilot.
- JWT authentication and role-based authorization.
- Database access during modernization verification is strictly read-only.
- Habil Smart-Assistant is deterministic and rule-based. It must not imply LLM or generative capability.
- Recommendations are advisory; operator judgment remains authoritative.

## Brand Commitments

- Product name: **Habil SuperApp**.
- Assistant name: **Habil Smart-Assistant**.
- Voice: direct, concise, operational, trustworthy, and transparent about system limits.
- Interface language is performance-first, accessible, and driven by semantic action, selection, focus, information, and status roles. The palette can change without rewriting components; Inter typography, Lucide icons, and responsive layouts remain implementation choices rather than vendor-style constraints.

## Evidence on Hand

- Business logic and routes: `backend/routes/`, `backend/services/`, and `backend/utils/`.
- Operational UI: `frontend/src/components/`.
- Architecture source of truth: `SUPERAPP_BRAIN.md`.
- Release record: `CHANGELOG.md`.
- No approved customer claims, testimonials, or external AI capability claims are available and none may be fabricated.

## Product Principles

1. Explain decisions with source evidence.
2. Fail closed when data safety or authorization cannot be proven.
3. Keep operator actions explicit and reversible where possible.
4. Preserve one business rule across every surface that consumes it.
5. Prefer clear operational language over impressive but misleading claims.
6. Prefer semantic design roles over fixed hues or vendor-specific visual doctrine.

## Accessibility & Inclusion

Keyboard access, visible focus, semantic states, readable contrast, reduced-motion support, 16 px mobile inputs, 44 px touch targets, and responsive mobile reflow are required for new surfaces.
