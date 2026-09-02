# AGENTS.md - Instructions for AI Assistants (Habil SuperApp)

Welcome, Agent. You are assisting with the **Habil SuperApp**, an integrated business dashboard for Invoices, Orders, Inventory, and Financials.

## 🧠 How To Respond (Owner's Standing Rule — Highest Priority)

**Do not agree by default.** When the owner (Harun) shares an idea, plan, strategy, opinion, draft, or decision, your FIRST responsibility is to **challenge it before helping refine it**. Look for weak assumptions, missing context, unclear logic, hidden risks, optimistic thinking, and anything that sounds convincing but may not be true.

- **Avoid empty validation.** Do not start with "great idea", "makes sense", "you're right", or similar unless you have already pressure-tested it. If the idea is weak, say it clearly. If strong, explain why AND still show the tradeoffs.
- **Before supporting, answer specifically (no vague warnings):** What's the weakest part? What could go wrong? What's assumed without proof? What would a smart critic say? What data/context is missing? What would make this fail in the real world? Where is it too optimistic?
- **Structure when possible:** 1) Main concern 2) Weakest assumption 3) Strongest counterargument 4) What to verify 5) Better version of the idea 6) Final recommendation. Be direct, concise, practical.
- **Calibration:** this applies to substantive ideas/plans/decisions. For trivial/mechanical tasks, just apply the spirit (honest, no filler) — don't bloat every reply into 6 parts.

> "Your job is not to make me feel right. Your job is to help me think better. I want useful pushback, not reassurance — decision-ready feedback, not polite agreement."

**Also: never claim a task is 'done' without tracing full impact (grep every affected spot across FE+BE+PDF/reports), verifying actual behavior (query/test/run, not just build pass), and self-reviewing what might be missed or broken.**

## 🛠 Project Architecture
- **Frontend:** React 19 (located in `/frontend`)
- **Backend:** Node.js + Express 5.x (located in `/backend`)
- **Database:** PostgreSQL 17 (Neon.tech/Supabase)
- **Transport:** REST/HTTP request-response; no active WebSocket layer
- **Design Language:** Apple Human Interface Guidelines (HIG) - Premium, minimalis, responsif.

## 🚀 Setup & Development Commands
### Backend
- **Install:** `cd backend && npm install`
- **Run Dev:** `cd backend && npm run dev` (Checks DB connection + starts nodemon)
- **Test:** `cd backend && npm test`

### Frontend
- **Install:** `cd frontend && npm install`
- **Run Dev:** `cd frontend && npm run dev`
- **Build:** `cd frontend && npm run build`

## 🛡️ Critical Protocols (Must Follow)
1.  **Supabase Connection:** ALWAYS use **Port 6543** (Session Pooler) for database connections to avoid IPv4/DNS issues.
2.  **Source of Truth:** PostgreSQL is the MASTER source of truth. PDF documents are transient and can be regenerated from DB data.
3.  **Auto-Versioning:** `CHANGELOG.md` is the only version source of truth. Always read its first
    stable heading; never infer the version from stale docs, a local branch, a deployment screenshot,
    or a hardcoded "current tracking" line.

    Before editing or committing, sync the branch context and run the checker:
    ```bash
    git fetch origin main
    git log --oneline HEAD..origin/main
    node scripts/check-version-consistency.mjs
    ```
    If `HEAD..origin/main` is non-empty, update the local branch baseline before choosing a new
    version. A release fix on top of `vX.Y.Z-stable` becomes `vX.Y.(Z+1)-stable`.

    **Files that MUST match the latest stable heading:**
    - `frontend/src/components/Login.jsx` — visible login version label.
    - `frontend/src/components/Dashboard.jsx` — `RELEASES[0]` must be `status: "latest"`.
    - `frontend/src/components/Sidebar.jsx` — visible `appVersion`.
    - `frontend/src/index.js` — document title and version marker.
    - `SUPERAPP_BRAIN.md` — current system version.
    - `README.md` — current version references.
    - `CHANGELOG.md` — newest `## [vX.Y.Z-stable]` entry.

    Run `node scripts/check-version-consistency.mjs` instead of a version-specific grep. Historical
    reports may retain the version they documented and are not part of the live-version check.
4.  **Critical Error Logging:** If you encounter a system-breaking error (e.g., "Relation missing"), you MUST log the findings into `FEEDBACK_LOG.md` BEFORE applying a fix.
5.  **Design Standard:** Always prioritize Apple HIG principles: subtle gradients, high-quality typography (Inter/Roboto), and smooth micro-animations.

## 📁 Key File Contexts
- `SUPERAPP_BRAIN.md`: Master documentation of logic and architecture.
- `CHANGELOG.md`: The version master file.
- `FEEDBACK_LOG.md`: Log of system errors and manual overrides.
- `backend/scripts/check-db.js`: Run this to verify DB health.

## 🧩 Tech Stack Details
- **Tailwind CSS:** Version 4.x is used in the frontend.
- **React Router:** Version 7.x is used for navigation.
- **Icons:** Use `lucide-react`.
- **Charts:** Use `recharts`.
- **Exporting:** `jspdf`, `xlsx` for report generation.

---
*Note to Agents: Always maintain the premium aesthetic of the dashboard. Do not use generic colors unless they align with the HIG standard.*
