export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}

export function certificateProblem(error: unknown): 'HTTPS' | 'RTSPS' | undefined {
  const message = errorMessage(error);
  if (message.includes('Camera HTTPS certificate was not trusted.')) return 'HTTPS';
  if (/RTSPS certificate (was not trusted|changed|trust does not match)/.test(message)) return 'RTSPS';
  return undefined;
}
