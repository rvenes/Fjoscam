const MAX_INPUT = 64 * 1024;
const MAX_MESSAGE = 2048;

// A final defence for diagnostic text, not a licence to log response bodies or
// credentials. Entire URLs are removed: generic stream paths can be secrets.
export function sanitizeDiagnosticMessage(value: string): string {
  return value.slice(0, MAX_INPUT)
    .replace(/\b(?:https?|rtsps?|wss?|file):(?:\\?\/){2}[^\s<>"'`]+/gi, '[URL redacted]')
    .replace(/\b(?:https?|rtsps?|wss?|file)%3a(?:%2f){2}[^\s<>"'`]+/gi, '[URL redacted]')
    .replace(/\b(?:authorization|proxy-authorization|set-cookie|cookie)\s*:\s*[^\r\n]*/gi, '[header redacted]')
    .replace(/(<(?:[\w.-]+:)?(?:Password|Username|Nonce|BinarySecurityToken)\b[^>]*>)[\s\S]*?(<\/(?:[\w.-]+:)?(?:Password|Username|Nonce|BinarySecurityToken)\s*>|$)/gi, '$1[redacted]$2')
    .replace(/((?:["']?)(?:password|passwd|pwd|username|user|token|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|authorization|proxy-authorization|cookie|set-cookie|streamUrl|src)(?:["']?)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*(?:"|$)|'(?:\\.|[^'\\])*(?:'|$)|[^,;\r\n}\]]+)/gi, '$1[redacted]')
    .replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .slice(0, MAX_MESSAGE);
}
