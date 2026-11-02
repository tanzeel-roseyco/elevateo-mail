// AIDEV-NOTE: Shared by playwright.config.ts (project testMatch) and src/test/viewport-specs.test.ts (drift
// guard). A spec that reads testInfo.project.name must be listed here or its viewport evidence silently stops.
export const VIEWPORT_SPECS = /(collaboration|email-finder|sso|visual-states)\.spec\.ts$/
