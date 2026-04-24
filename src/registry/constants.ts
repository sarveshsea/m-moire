/**
 * Registry constants — Marketplace URL and shared registry-level defaults.
 *
 * The base URL can be overridden via the `MEMOIRE_MARKETPLACE_URL` env var
 * for dev/staging environments. Do NOT hardcode the URL elsewhere; import
 * from here so overrides work everywhere.
 */

/** Default production Marketplace origin. */
export const DEFAULT_MARKETPLACE_BASE_URL = "https://memoire.cv";
export const DEFAULT_NPM_PACKAGE_BASE_URL = "https://www.npmjs.com/package";

/**
 * Resolved Marketplace base URL (no trailing slash).
 *
 * Override with `MEMOIRE_MARKETPLACE_URL=https://staging.memoire.cv`
 * to point the CLI at a different Marketplace instance.
 */
export const MARKETPLACE_BASE_URL: string = (
  process.env.MEMOIRE_MARKETPLACE_URL || DEFAULT_MARKETPLACE_BASE_URL
).replace(/\/+$/, "");

/**
 * Build a Marketplace URL for a given registry's index page.
 * e.g. `@acme/ds` → `https://memoire.cv/r/@acme/ds`
 */
export function marketplaceRegistryUrl(registryName: string): string {
  return `${MARKETPLACE_BASE_URL}/r/${registryName}`;
}

/**
 * Build a Marketplace URL for a specific component within a registry.
 * e.g. (`@acme/ds`, `Button`) → `https://memoire.cv/components/@acme/ds/Button`
 */
export function marketplaceComponentUrl(registryName: string, component: string): string {
  return `${MARKETPLACE_BASE_URL}/components/${registryName}/${component}`;
}

/**
 * Build the public npm package page for a published registry.
 * e.g. `@acme/ds` → `https://www.npmjs.com/package/@acme/ds`
 */
export function npmPackageUrl(registryName: string): string {
  return `${DEFAULT_NPM_PACKAGE_BASE_URL}/${registryName}`;
}
