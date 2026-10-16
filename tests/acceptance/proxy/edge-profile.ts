// AIDEV-NOTE: Only these fixture identities exist; request headers never choose the upstream identity.
export const HTTP_EDGE = Object.freeze({ host: 'app.test', scheme: 'http', port: '80' } as const);
export const ANDROID_EDGE = Object.freeze({ host: 'elevateo.qa.internal', scheme: 'https', port: '443' } as const);
export type EdgeProfile = typeof HTTP_EDGE | typeof ANDROID_EDGE;
