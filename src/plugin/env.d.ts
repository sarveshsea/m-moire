declare module "*.css";
declare module "*.mjs";

// Pull in the official Figma plugin API types. With this in place,
// `declare const figma: any` in main/index.ts can be replaced with
// `declare const figma: PluginAPI` (#38). Typings are devDependency-only
// and do not ship in the runtime bundle.
/// <reference types="@figma/plugin-typings" />

