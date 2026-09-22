// Keep only safe, structured metadata. Camera response bodies and API detail
// strings can contain credentials and must not become error messages/causes.
export class CameraHttpError extends Error {
  constructor(readonly status: number) {
    super(`Camera HTTP ${status}`);
    this.name = 'CameraHttpError';
  }
}

export class ReolinkApiError extends Error {
  readonly rspCode: number | undefined;
  readonly authenticationRequired: boolean;
  readonly abilityDenied: boolean;

  constructor(rspCode: unknown, detail: unknown) {
    const code = typeof rspCode === 'number' && Number.isSafeInteger(rspCode) ? rspCode : undefined;
    // Exact legacy phrases only, and only when firmware omits the numeric code.
    const legacy = code === undefined && typeof detail === 'string' ? detail.trim().toLowerCase() : '';
    const authenticationRequired = code === -6 || code === -21 || legacy === 'please login first' || legacy === 'error token';
    const abilityDenied = code === -26 || legacy === 'ability error';
    const reason = authenticationRequired ? 'login required' : abilityDenied ? 'ability or permission denied'
      : [-7, -27, -501, -502, -503].includes(code ?? 0) ? 'login rejected; check credentials and access'
        : [-5, -105, -506, -507].includes(code ?? 0) ? 'login locked or session limit reached; wait before retrying' : 'command failed';
    super(`Reolink API rejected request: ${reason}${code === undefined ? '' : ` (rspCode ${code})`}`);
    this.name = 'ReolinkApiError';
    this.rspCode = code;
    this.authenticationRequired = authenticationRequired;
    this.abilityDenied = abilityDenied;
  }
}

export function isCameraAuthenticationError(error: unknown): boolean {
  return (error instanceof CameraHttpError && error.status === 401) ||
    (error instanceof ReolinkApiError && error.authenticationRequired);
}

export function isCameraLoginRejection(error: unknown): boolean {
  return isCameraAuthenticationError(error) || (error instanceof CameraHttpError && error.status === 403) ||
    (error instanceof ReolinkApiError && [-5, -7, -27, -105, -501, -502, -503, -505, -506, -507].includes(error.rspCode ?? 0));
}
