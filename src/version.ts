declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

/** The game's version, from package.json, and the commit and date it was built from. */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';

/** "Version 1.1.4 (a1b2c3d · 2026-10-29)". */
export const VERSION_LABEL = `Version ${APP_VERSION} (${APP_BUILD})`;
