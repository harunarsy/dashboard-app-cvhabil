const express = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const { loadSmartAssistantData } = require('../services/smartAssistantData');
const {
  buildSmartAssistantResponse,
  resolveScope,
} = require('../services/smartAssistantEngine');
const { withReadOnlyTransaction } = require('../utils/readOnlyTransaction');

const router = express.Router();
const REQUEST_TIMEOUT_MS = 10000;
const ALLOWED_ROLES = new Set(['admin', 'direktur']);

const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Terlalu banyak permintaan. Coba lagi sebentar.',
      },
    }),
});

const withTimeout = (promise, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('Smart-Assistant request timed out');
      error.code = 'SMART_ASSISTANT_TIMEOUT';
      reject(error);
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

router.use(auth);
router.use((req, res, next) => {
  if (!ALLOWED_ROLES.has(req.user?.role)) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Role ini tidak memiliki akses ke Smart-Assistant.',
      },
    });
  }
  next();
});
router.use(assistantLimiter);

router.post('/recommendations', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const requestedScope = req.body?.scope;
  const parsedLimit = Number.parseInt(req.body?.limit, 10);

  if (message.length > 500) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Pesan maksimal 500 karakter.',
      },
    });
  }
  if (
    requestedScope !== undefined &&
    !['overview', 'inventory', 'customers', 'sales'].includes(requestedScope)
  ) {
    return res.status(400).json({
      error: {
        code: 'INVALID_SCOPE',
        message: 'Scope harus overview, inventory, customers, atau sales.',
      },
    });
  }
  if (
    req.body?.limit !== undefined &&
    (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 12)
  ) {
    return res.status(400).json({
      error: {
        code: 'INVALID_LIMIT',
        message: 'Limit harus berupa angka 1 sampai 12.',
      },
    });
  }

  try {
    const scope = resolveScope(message, requestedScope);
    const dataPromise = withReadOnlyTransaction(
      (connection) => loadSmartAssistantData(connection, scope),
      { queryTimeoutMs: 3000 },
    );
    const data = await withTimeout(dataPromise, REQUEST_TIMEOUT_MS);

    return res.json(
      buildSmartAssistantResponse(data, {
        message,
        requestedScope: scope,
        limit: parsedLimit || 8,
      }),
    );
  } catch (error) {
    const timeout = error.code === 'SMART_ASSISTANT_TIMEOUT';
    const readOnlyFailure = error.code === 'READ_ONLY_NOT_ENFORCED';
    console.error('[smart-assistant] request failed:', error.message);
    return res.status(timeout ? 504 : readOnlyFailure ? 503 : 500).json({
      error: {
        code: timeout
          ? 'REQUEST_TIMEOUT'
          : readOnlyFailure
            ? 'READ_ONLY_GUARD_FAILED'
            : 'ASSISTANT_UNAVAILABLE',
        message: timeout
          ? 'Analisis melewati batas waktu. Silakan coba lagi.'
          : readOnlyFailure
            ? 'Mode database read-only tidak dapat diverifikasi.'
            : 'Smart-Assistant sementara tidak dapat memproses data.',
      },
    });
  }
});

module.exports = router;
