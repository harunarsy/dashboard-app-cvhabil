const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function isLocalHostname(hostname) {
  if (!hostname) return false;
  const normalized = String(hostname).trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  );
}

function stripSslmode(raw) {
  try {
    const url = new URL(raw);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return raw;
  }
}

function resolveRuntimeEnvFile({
  baseDir,
  preferDevEnv = true,
  runtime = process.env.NODE_ENV,
} = {}) {
  if (!baseDir) {
    throw new Error('[Env] baseDir is required to resolve local env files');
  }

  if (runtime === 'production') {
    return null;
  }

  const candidateNames = preferDevEnv ? ['.env.dev', '.env'] : ['.env', '.env.dev'];
  for (const fileName of candidateNames) {
    const fullPath = path.join(baseDir, fileName);
    if (fs.existsSync(fullPath)) {
      return { fileName, fullPath };
    }
  }

  return null;
}

function loadRuntimeEnv({
  baseDir,
  context = 'runtime',
  preferDevEnv = true,
  runtime = process.env.NODE_ENV,
} = {}) {
  if (process.env.HABIL_ENV_LOADED === '1') {
    return {
      envFile: process.env.HABIL_ENV_FILE || null,
      loaded: false,
      skipped: true,
    };
  }

  if (runtime === 'production') {
    process.env.HABIL_ENV_LOADED = '1';
    process.env.HABIL_ENV_FILE = 'injected';
    console.log(`[Env] ${context}: production runtime uses injected environment variables`);
    return {
      envFile: null,
      loaded: false,
      source: 'injected',
    };
  }

  const selected = resolveRuntimeEnvFile({ baseDir, preferDevEnv, runtime });
  if (selected) {
    dotenv.config({ path: selected.fullPath });
    process.env.HABIL_ENV_LOADED = '1';
    process.env.HABIL_ENV_FILE = selected.fileName;
    console.log(`[Env] ${context}: loaded ${selected.fileName}`);
    return {
      envFile: selected.fileName,
      loaded: true,
      source: selected.fullPath,
    };
  }

  process.env.HABIL_ENV_LOADED = '1';
  process.env.HABIL_ENV_FILE = 'system';
  console.log(`[Env] ${context}: no local env file found, using system environment variables`);
  return {
    envFile: null,
    loaded: false,
    source: 'system',
  };
}

function describeDbTarget() {
  const rawUrl = process.env.DATABASE_URL?.trim();
  if (rawUrl) {
    const stripped = stripSslmode(rawUrl);
    let url;
    try {
      url = new URL(stripped);
    } catch (error) {
      throw new Error(`[Env] Invalid DATABASE_URL: ${error.message}`);
    }

    return {
      source: 'DATABASE_URL',
      host: url.hostname,
      isRemote: !isLocalHostname(url.hostname),
      connectionType: 'url',
      connectionString: stripped,
    };
  }

  const host = (process.env.DB_HOST || '').trim();
  return {
    source: 'DB_HOST',
    host,
    isRemote: !!host && !isLocalHostname(host),
    connectionType: 'host',
  };
}

function ensureDbTargetSafety({
  context = 'runtime',
  allowProdLocal = false,
  allowProdSmoke = false,
} = {}) {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return {
      checked: false,
      productionRuntime: true,
    };
  }

  const target = (process.env.HABIL_DB_TARGET || '').trim().toLowerCase();
  const dbTarget = describeDbTarget();
  const allowProdLocalOverride = allowProdLocal || process.env.ALLOW_PROD_LOCAL === 'true';

  if (target && !['dev', 'audit', 'prod-smoke', 'prod'].includes(target)) {
    throw new Error(
      `[Env] ${context}: invalid HABIL_DB_TARGET=${target}. Use dev, audit, prod-smoke, or prod (with ALLOW_PROD_LOCAL=true).`,
    );
  }

  if (target === 'prod') {
    if (!allowProdLocalOverride) {
      throw new Error(
        `[Env] ${context}: HABIL_DB_TARGET=prod is blocked in local/dev. Set ALLOW_PROD_LOCAL=true only for an explicit prod-local override.`,
      );
    }
    console.warn(
      `[Env] ${context}: ALLOW_PROD_LOCAL=true granted for HABIL_DB_TARGET=prod. Proceed with extreme care.`,
    );
    return {
      checked: true,
      remote: dbTarget.isRemote,
      target,
      dbTarget,
      prodOverride: true,
    };
  }

  if (!dbTarget.isRemote) {
    return {
      checked: true,
      remote: false,
      target: target || null,
      dbTarget,
    };
  }

  if (!target) {
    throw new Error(
      `[Env] ${context}: remote DB detected via ${dbTarget.source}${dbTarget.host ? ` (${dbTarget.host})` : ''}, but HABIL_DB_TARGET is missing. Set HABIL_DB_TARGET=dev|audit|prod-smoke.`,
    );
  }

  if (target === 'prod-smoke' && !allowProdSmoke) {
    throw new Error(
      `[Env] ${context}: HABIL_DB_TARGET=prod-smoke is read-only and not allowed for this runtime. Use dev or audit for write-capable startup.`,
    );
  }

  return {
    checked: true,
    remote: true,
    target,
    dbTarget,
  };
}

module.exports = {
  describeDbTarget,
  ensureDbTargetSafety,
  isLocalHostname,
  loadRuntimeEnv,
  resolveRuntimeEnvFile,
  stripSslmode,
};
