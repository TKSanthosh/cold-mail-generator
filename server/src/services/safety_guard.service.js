/**
 * Production Safety Guard Service
 * Hard interceptor that strictly prevents destructive actions (real Naukri applications,
 * real emails, production data mutations) when TEST_MODE=true or DRY_RUN=true.
 */

const blockedActionsLog = [];

function isTestModeActive() {
  return process.env.TEST_MODE === 'true' || 
         process.env.DRY_RUN === 'true' || 
         process.env.NODE_ENV === 'test';
}

function shouldMockNaukri() {
  return isTestModeActive() || process.env.MOCK_NAUKRI === 'true';
}

function shouldMockSubmission() {
  return isTestModeActive() || process.env.MOCK_APPLICATION_SUBMISSION === 'true';
}

function shouldMockEmails() {
  return isTestModeActive() || process.env.MOCK_EXTERNAL_APIS === 'true';
}

function blockDestructiveAction(actionType, details = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    actionType,
    details,
    stack: new Error().stack
  };
  blockedActionsLog.push(record);
  console.log(`[TEST MODE] BLOCKED_TEST_ACTION: Action "${actionType}" intercepted safely.`);
  return {
    blocked: true,
    actionType,
    status: 'BLOCKED_TEST_ACTION',
    message: `[TEST MODE] Action "${actionType}" blocked safely.`
  };
}

function getBlockedActions() {
  return [...blockedActionsLog];
}

function clearBlockedActions() {
  blockedActionsLog.length = 0;
}

module.exports = {
  isTestModeActive,
  shouldMockNaukri,
  shouldMockSubmission,
  shouldMockEmails,
  blockDestructiveAction,
  getBlockedActions,
  clearBlockedActions
};
