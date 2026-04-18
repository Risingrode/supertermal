function shouldIgnoreTerminalKeyEvent(event) {
  return !!event && (!!event.isComposing || Number(event.keyCode) === 229);
}

const terminalInputGuard = { shouldIgnoreTerminalKeyEvent };

if (typeof module === 'object' && module.exports) {
  module.exports = terminalInputGuard;
}

if (typeof window !== 'undefined') {
  window.TerminalInputGuard = terminalInputGuard;
}
