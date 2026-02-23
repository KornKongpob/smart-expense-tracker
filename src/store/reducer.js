// src/store/reducer.js
/**
 * Canonical reducer module.
 *
 * This file intentionally re-exports the reducer + initial state factory
 * from `store.jsx` so there is a single implementation source of truth and
 * zero duplicated reducer logic across store modules.
 */

export { createInitialState, reducer } from "./store.jsx";
