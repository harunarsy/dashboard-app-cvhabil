# AGENTS.md - Instructions for AI Assistants (Habil SuperApp)

Welcome, Agent. You are assisting with the **Habil SuperApp**, a real-time business dashboard for Invoices, Orders, Inventory, and Financials.

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
