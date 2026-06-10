# AGENTS.md - Instructions for AI Assistants (Habil SuperApp)

Welcome, Agent. You are assisting with the **Habil SuperApp**, a real-time business dashboard for Invoices, Orders, Inventory, and Financials.

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
- **Real-time:** Socket.io
- **Design Language:** Apple Human Interface Guidelines (HIG) - Premium, minimalis, responsif.

## 🚀 Setup & Development Commands
### Backend
- **Install:** `cd backend && npm install`
- **Run Dev:** `cd backend && npm run dev` (Checks DB connection + starts nodemon)
- **Test:** `cd backend && npm test`

### Frontend
- **Install:** `cd frontend && npm install`
- **Run Dev:** `cd frontend && npm start`
- **Build:** `cd frontend && npm run build`

## 🛡️ Critical Protocols (Must Follow)
1.  **Supabase Connection:** ALWAYS use **Port 6543** (Session Pooler) for database connections to avoid IPv4/DNS issues.
2.  **Source of Truth:** PostgreSQL is the MASTER source of truth. PDF documents are transient and can be regenerated from DB data.
3.  **Auto-Versioning:** Before every commit, ensure the version string in **ALL** of the following files matches the latest entry in `CHANGELOG.md`. Missing even one will cause version mismatch visible to users.

    **Files that MUST be updated every version bump (run grep to verify):**
    ```
    grep -rn "v1\.3\." frontend/src/ --include="*.jsx" --include="*.js"
    ```
    | File | Location | What to change |
    |------|----------|----------------|
    | `frontend/src/components/Login.jsx` | line ~45 | subtitle text `HABIL SUPERAPP vX.X.XX-stable — 2026` |
    | `frontend/src/components/Dashboard.jsx` | `RELEASES` array top | add new entry as `status: 'latest'`, demote old to `status: 'stable'` |
    | `frontend/src/components/Sidebar.jsx` | `const appVersion` | string literal |
    | `frontend/src/index.js` | lines ~11,15,16 | `<p>` text + `document.title` + comment |
    | `CHANGELOG.md` | top of file | add new `## [vX.X.XX-stable]` section |

    **Current tracking:** `v1.3.x`
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
