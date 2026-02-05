const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function escapePromptText(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function sanitizeUserInput(text: string, maxLen = 2000): string {
  const cleaned = String(text || '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sliced = cleaned.slice(0, maxLen);
  return escapePromptText(sliced);
}

export function sanitizeContext(text: string, maxLen = 20000): string {
  const cleaned = String(text || '')
    .replace(CONTROL_CHARS, ' ')
    .trim();
  const sliced = cleaned.slice(0, maxLen);
  return escapePromptText(sliced);
}

export function wrapUserQuestion(text: string): string {
  return `<user_question>\n${text}\n</user_question>`;
}

export function wrapContext(text: string): string {
  return `<context>\n${text}\n</context>`;
}

export function detectPromptInjection(text: string): boolean {
  const lower = String(text || '').toLowerCase();
  return [
    'ignore previous',
    'ignore all previous',
    'system prompt',
    'you are now',
    'developer message',
    'instructions above',
    'jailbreak',
    '</context>',
    '</user_question>'
  ].some(token => lower.includes(token));
}
