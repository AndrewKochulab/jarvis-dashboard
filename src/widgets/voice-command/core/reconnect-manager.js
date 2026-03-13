// Voice Command — Reconnect manager
// Manages window.__jarvisStreamState for surviving Obsidian re-renders.
// Desktop: full reconnection to in-flight Claude processes.
// Mobile: simplified (no window global needed).

function createReconnectManager(options) {
  const { isDesktop } = options || {};

  // Desktop: use window global
  if (isDesktop) {
    if (typeof window.__jarvisStreamState === "undefined") {
      window.__jarvisStreamState = null;
    }

    return {
      getActiveStream() {
        return window.__jarvisStreamState;
      },

      createStreamState(process, sessionId, opts) {
        const state = {
          process,
          sessionId,
          jarvisSessionId: opts.jarvisSessionId,
          projectIndex: opts.projectIndex,
          detectedLang: opts.detectedLang,
          buffer: "",
          lineBuf: "",
          toolEvents: [],
          conversationHistory: [...(opts.conversationHistory || [])],
          preSpawnJsonlSet: opts.preSpawnJsonlSet,
          uiState: "streaming",
          exitCode: null,
          // Delegates (nulled on cleanup, reattached on reconnect)
          _onTextDelta: null,
          _onToolUse: null,
          _onStderr: null,
          _onClose: null,
          _onPermissionRequest: null,
          _onQuestionRequest: null,
          _onDisplayCard: null,
          pendingInteractions: [],
          activeToolBlock: null,
          _activeSection: null,
          pendingPermissions: [],
          retryAllowedTools: null,
          tempPermissions: [],
          resultReceived: false,
          _retryPending: false,
          _lastStatusLabel: null,
          _thinkingShown: false,
          _turnTextNodes: [],
          _streamRenderer: null,
        };
        window.__jarvisStreamState = state;
        return state;
      },

      clearStreamState() {
        window.__jarvisStreamState = null;
      },

      isReconnecting() {
        const st = window.__jarvisStreamState;
        return st && (st.uiState === "streaming" || st.uiState === "closing" ||
               st.uiState === "waiting_permission" || st.uiState === "waiting_askuser");
      },

      // Claim ownership and return stream state for reconnection
      claimOwnership(section) {
        const st = window.__jarvisStreamState;
        if (st) st._activeSection = section;
        return st;
      },

      // Null out delegates safely (only if this section owns them)
      releaseOwnership(section) {
        const st = window.__jarvisStreamState;
        if (st && st._activeSection === section) {
          st._onTextDelta = null;
          st._onToolUse = null;
          st._onStderr = null;
          st._onClose = null;
          st._onPermissionRequest = null;
          st._onQuestionRequest = null;
          st._onDisplayCard = null;
        }
      },
    };
  }

  // Mobile: simplified (in-memory only)
  let _streamState = null;

  return {
    getActiveStream() { return _streamState; },

    createStreamState(process, sessionId, opts) {
      _streamState = {
        sessionId,
        buffer: "",
        uiState: "streaming",
        pendingInteractions: [],
      };
      return _streamState;
    },

    clearStreamState() { _streamState = null; },
    isReconnecting() { return false; },
    claimOwnership() { return _streamState; },
    releaseOwnership() {},
  };
}

return { createReconnectManager };
