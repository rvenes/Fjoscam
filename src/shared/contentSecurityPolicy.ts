// Camera traffic is mediated by main. Only the local player frame and image
// proxy need network access from the app document. Dev adds Vite HMR/refresh.
export function rendererContentSecurityPolicy(development = false): string {
  return [
    "default-src 'none'",
    `script-src 'self'${development ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: http://127.0.0.1:*",
    "frame-src http://127.0.0.1:1984",
    development ? "connect-src 'self' ws://127.0.0.1:5173" : "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
