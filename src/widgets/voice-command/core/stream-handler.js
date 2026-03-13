// Voice Command — Stream handler
// Parses NDJSON stream events and dispatches typed callbacks.
// Used by both local (stdout) and remote (networkClient events) paths.

function createStreamHandler(callbacks) {
  const {
    onTextDelta, onToolUseStart, onToolUseComplete,
    onControlRequest, onResult, onAssistantMessage, onThinking,
    onError, onSessionId,
  } = callbacks;

  let lineBuf = "";
  let activeToolBlock = null;
  let toolEvents = [];
  let buffer = "";
  let resultReceived = false;
  let _lastStatusLabel = null;
  let _thinkingShown = false;

  function processNdjsonLine(line) {
    if (!line.trim()) return;
    try {
      const evt = JSON.parse(line);

      // Text delta
      if (evt.type === "stream_event" &&
          evt.event?.type === "content_block_delta" &&
          evt.event?.delta?.type === "text_delta") {
        const txt = evt.event.delta.text;
        buffer += txt;
        _lastStatusLabel = null;
        if (onTextDelta) onTextDelta(txt);
      }

      // Tool-use start
      if (evt.type === "stream_event" &&
          evt.event?.type === "content_block_start" &&
          evt.event?.content_block?.type === "tool_use") {
        const block = evt.event.content_block;
        activeToolBlock = {
          name: block.name,
          id: block.id,
          index: evt.event.index,
          inputJsonChunks: [],
          controlRequestFired: false,
        };
        toolEvents.push(block.name);
        if (onToolUseStart) onToolUseStart(block.name, block.id);
      }

      // Accumulate tool input JSON
      if (evt.type === "stream_event" &&
          evt.event?.type === "content_block_delta" &&
          evt.event?.delta?.type === "input_json_delta") {
        if (activeToolBlock) {
          activeToolBlock.inputJsonChunks.push(evt.event.delta.partial_json);
        }
      }

      // Tool-use complete
      if (evt.type === "stream_event" &&
          evt.event?.type === "content_block_stop" &&
          activeToolBlock) {
        const block = activeToolBlock;
        activeToolBlock = null;
        let parsedInput = {};
        try { parsedInput = JSON.parse(block.inputJsonChunks.join("")); } catch {}
        if (onToolUseComplete) onToolUseComplete(block.name, block.id, parsedInput);
      }

      // Control request
      if (evt.type === "control_request") {
        if (activeToolBlock && activeToolBlock.name === evt.request?.tool_name) {
          activeToolBlock.controlRequestFired = true;
        }
        if (onControlRequest) onControlRequest(evt.request_id, evt.request || {});
      }

      // Session ID
      if (evt.session_id && onSessionId) onSessionId(evt.session_id);

      // Result
      if (evt.type === "result") {
        resultReceived = true;
        if (evt.session_id && onSessionId) onSessionId(evt.session_id);
        // Fallback: extract from result if no deltas
        if (evt.result && !buffer) {
          buffer += evt.result;
          if (onTextDelta) onTextDelta(evt.result);
        }
        if (onResult) onResult(evt);
      }

      // Assistant message (contains complete tool_use blocks)
      if (evt.type === "assistant" && evt.message?.content) {
        let hasThinking = false;
        for (const block of evt.message.content) {
          if (block.type === "thinking" && !hasThinking) {
            hasThinking = true;
            if (!_thinkingShown) {
              _thinkingShown = true;
              if (onThinking) onThinking();
            }
          }
          if (block.type === "tool_use") {
            if (onAssistantMessage) onAssistantMessage(block);
          }
        }
      }

    } catch (e) {
      console.log("[JARVIS-DEBUG] JSON parse failed:", line.substring(0, 1000), e.message);
      if (onError) onError(e);
    }
  }

  function processNdjsonChunk(chunk) {
    lineBuf += chunk;
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop();
    for (const line of lines) {
      processNdjsonLine(line);
    }
  }

  // For network events (already parsed)
  function handleNetworkEvent(type, msg) {
    if (type === "stream_delta") {
      buffer += msg.text;
      _lastStatusLabel = null;
      if (onTextDelta) onTextDelta(msg.text);
    } else if (type === "stream_end") {
      if (onResult) onResult({ type: "stream_end", sessionId: msg.sessionId });
    } else if (type === "transcription") {
      // Handled by orchestrator
    } else if (type === "permission_request") {
      if (onControlRequest) onControlRequest(msg.requestId, {
        ...msg.request,
        subtype: "can_use_tool",
      });
    } else if (type === "question_request") {
      if (onControlRequest) onControlRequest(msg.requestId, {
        ...msg.request,
        subtype: "elicitation",
      });
    } else if (type === "tts_audio") {
      // Handled by TTS adapter
    } else if (type === "error") {
      if (onError) onError(new Error(msg.message || "Unknown error"));
    }
  }

  function getState() {
    return {
      buffer,
      lineBuf,
      toolEvents,
      activeToolBlock,
      resultReceived,
      _lastStatusLabel,
      _thinkingShown,
    };
  }

  function resetForNewTurn() {
    buffer = "";
    lineBuf = "";
    toolEvents = [];
    activeToolBlock = null;
    resultReceived = false;
    _lastStatusLabel = null;
    _thinkingShown = false;
  }

  function cleanup() {
    lineBuf = "";
    activeToolBlock = null;
  }

  return {
    processNdjsonChunk,
    processNdjsonLine,
    handleNetworkEvent,
    getState,
    resetForNewTurn,
    cleanup,
    get buffer() { return buffer; },
    get resultReceived() { return resultReceived; },
    get lastStatusLabel() { return _lastStatusLabel; },
    set lastStatusLabel(v) { _lastStatusLabel = v; },
    get thinkingShown() { return _thinkingShown; },
  };
}

return { createStreamHandler };
