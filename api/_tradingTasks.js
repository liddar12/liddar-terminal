const LEGACY_TRADING_TASKS = new Set(['scanner', 'trade_decision', 'price_action_trend']);

// This matches the shared-project SQL contract. Task selection never chooses
// a schema, table, RPC or permission boundary.
export function isTradingTask(task) {
  return typeof task === 'string' && task.length <= 200 && !/\s/.test(task)
    && (LEGACY_TRADING_TASKS.has(task) || /^trading\.[a-z][a-z0-9_.-]*$/.test(task));
}
