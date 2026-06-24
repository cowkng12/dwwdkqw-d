function normalizeNumber(value) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getTelegramConfig() {
  const apiId = normalizeNumber(process.env.TELEGRAM_API_ID);
  const apiHash = normalizeString(process.env.TELEGRAM_API_HASH);
  const session = normalizeString(process.env.TELEGRAM_SESSION);

  return {
    apiId,
    apiHash,
    session,
    isConfigured: Boolean(apiId && apiHash),
    hasSession: Boolean(session)
  };
}

export function getTelegramStatus() {
  const config = getTelegramConfig();

  return {
    isConfigured: config.isConfigured,
    hasSession: config.hasSession,
    apiId: config.apiId,
    accountMode: config.hasSession ? "session-ready" : "api-ready",
    missing: {
      apiId: !config.apiId,
      apiHash: !config.apiHash,
      session: !config.session
    }
  };
}
