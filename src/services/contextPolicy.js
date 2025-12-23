function getContextPolicy(overrides = {}) {
  const envWindow =
    Number.parseInt(process.env.CONTEXT_WINDOW_MINUTES, 10) || 120;
  const envRetention =
    Number.parseInt(process.env.CONTEXT_RETENTION_DAYS, 10) || 7;

  return {
    windowMinutes: overrides.windowMinutes ?? envWindow,
    retentionDays: overrides.retentionDays ?? envRetention,
    maxTurns: overrides.maxTurns ?? 10,
  };
}

module.exports = { getContextPolicy };

