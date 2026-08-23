# Habil Smart-Assistant — Implementation Contract

Status: implemented in Phase 6

Mode: deterministic rule engine; no LLM, OpenAI SDK, Vercel AI SDK, LangChain, vector database, or Python runtime.

## Product Boundary

- Product name: **Habil Smart-Assistant**.
- Disclosure shown in the UI and API: **Rule-based smart suggestions**.
- Recommendations show their rule basis and supporting evidence.
- The assistant maps operator questions to supported scopes. It does not generate facts or answer outside the available rules.
- Every recommendation remains advisory and requires operator judgment.

## Existing Rules Reused

| Rule | Existing basis | Threshold / calculation |
|---|---|---|
| Restock velocity | `GET /api/insights/restock` | 30-day velocity × 70% + days 31–90 × 30%; alert when estimated stock life is under 21 days |
| Product health | `GET /api/insights/product-health` | Movement 30%, margin 30%, trend 20%, expiry safety 20%; grade A–E |
| Customer dormancy | `GET /api/insights/dormant` | Customer has prior final orders and has been silent for more than 30 days |
| Weekly sales delta | `GET /api/insights/weekly-summary` | Last seven days compared with the previous seven days |

The shared restock and product-health calculations now live in `backend/utils/insightRules.js`, so the existing Insights endpoints and Smart-Assistant do not maintain separate formulas.

## API Contract

Endpoint: `POST /api/ai/recommendations`

Request:

```json
{
  "message": "Apa prioritas bisnis hari ini?",
  "scope": "overview",
  "limit": 8
}
```

Supported scopes: `overview`, `inventory`, `customers`, and `sales`.

Response fields:

- `assistant`: name, `rule_based` mode, and disclosure.
- `request`: resolved scope and bounded input message.
- `summary`: deterministic count summary.
- `recommendations[]`: severity, title, summary, reason, evidence, and an internal action path.
- `meta`: timestamp, rule version, read-only data boundary, evaluated rules, and output limit.

## Security and Failure Controls

- JWT authentication is mandatory.
- Authorization is limited to `admin` and `direktur`; `pajak` is rejected with `403`.
- Route rate limit: 30 requests per minute per client, in addition to the global API limiter.
- Input message: maximum 500 characters.
- Output: maximum 12 recommendations; UI requests eight.
- Request timeout: 10 seconds; each PostgreSQL query has a three-second query timeout.
- Structured errors cover validation, authorization, rate limiting, timeout, read-only verification, and unavailable service states.
- Every data load starts with `BEGIN READ ONLY`, verifies `SHOW transaction_read_only = on`, and ends with `ROLLBACK`.
- All assistant SQL is `SELECT`/`WITH`; the route contains no insert, update, delete, DDL, or migration path.

## Main Files

- `backend/routes/ai.js`
- `backend/services/smartAssistantData.js`
- `backend/services/smartAssistantEngine.js`
- `backend/utils/insightRules.js`
- `backend/utils/readOnlyTransaction.js`
- `frontend/src/components/SmartAssistant.jsx`
- `frontend/src/components/SmartAssistant.test.jsx`

## Verification Coverage

- Pure rule parity and deterministic intent tests.
- Read-only transaction fail-closed tests.
- HTTP authentication, authorization, route mount, response contract, and zero-mutation checks.
- Live PostgreSQL read-only integration under Node 20 and Bun.
- Frontend loading, success/evidence, scope selection, and error recovery tests.
- Vite production builds under Node 20, Node 24, and Bun.
- Impeccable desktop, mobile, dark-mode, reduced-motion, overflow, input-size, and target-size checks.
