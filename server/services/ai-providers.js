function cumulativeDelta(value, previous) {
  if (typeof value !== 'string' || value.length === 0) return '';
  return previous && value.startsWith(previous)
    ? value.slice(previous.length)
    : value;
}

const providers = Object.freeze({
  deepseek: Object.freeze({
    id: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    secretName: 'deepseek_api_key',
    buildConnectionTestBody() {
      return {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'ping' }],
        thinking: { type: 'disabled' },
        stream: false,
        max_tokens: 1
      };
    },
    buildRequestBody({
      model,
      messages,
      maxTokens,
      reasoning,
      userId
    }) {
      return {
        model,
        messages,
        thinking: {
          type: reasoning ? 'enabled' : 'disabled'
        },
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: maxTokens,
        user_id: userId
      };
    },
    extractDelta(chunk) {
      const delta = chunk.choices?.[0]?.delta || {};
      return {
        reasoning:
          typeof delta.reasoning_content === 'string'
            ? delta.reasoning_content
            : '',
        content: typeof delta.content === 'string' ? delta.content : ''
      };
    }
  }),
  minimax: Object.freeze({
    id: 'minimax',
    displayName: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    secretName: 'minimax_api_key',
    buildConnectionTestBody() {
      return {
        model: 'MiniMax-M3',
        messages: [{ role: 'user', content: 'ping' }],
        thinking: { type: 'disabled' },
        reasoning_split: true,
        stream: false,
        max_completion_tokens: 1
      };
    },
    buildRequestBody({
      model,
      messages,
      maxTokens,
      reasoning
    }) {
      return {
        model,
        messages,
        thinking: {
          type: reasoning ? 'adaptive' : 'disabled'
        },
        reasoning_split: true,
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: maxTokens
      };
    },
    extractDelta(chunk, state = {}) {
      const delta = chunk.choices?.[0]?.delta || {};
      const reasoningDetails = Array.isArray(delta.reasoning_details)
        ? delta.reasoning_details
        : [];
      const detailedReasoning = reasoningDetails
        .map(detail => typeof detail?.text === 'string' ? detail.text : '')
        .join('');
      const reasoningValue = detailedReasoning ||
        (typeof delta.reasoning_content === 'string'
          ? delta.reasoning_content
          : '');
      const contentValue =
        typeof delta.content === 'string' ? delta.content : '';
      const reasoning = cumulativeDelta(
        reasoningValue,
        state.reasoningValue || ''
      );
      const content = cumulativeDelta(
        contentValue,
        state.contentValue || ''
      );
      if (reasoningValue) state.reasoningValue = reasoningValue;
      if (contentValue) state.contentValue = contentValue;
      return { reasoning, content };
    }
  })
});

export const AI_PROVIDER_IDS = Object.freeze(Object.keys(providers));

export function getAiProvider(id) {
  return providers[String(id || '').trim().toLowerCase()] || null;
}
