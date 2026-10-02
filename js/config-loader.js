import { CONFIG as defaults } from "./config.example.js";

// A missing local key file must never prevent the rest of the app from loading.
let local = {};
try { local = (await import("./config.js")).CONFIG ?? {}; } catch { /* setup is optional */ }
export const CONFIG = Object.freeze({ ...defaults, ...local });
export const hasKey = (value) => Boolean(value?.trim() && !value.startsWith("YOUR_"));
