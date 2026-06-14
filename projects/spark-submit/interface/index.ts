/**
 * Spark Submit Interface Layer
 *
 * This module exports all shared types and interfaces used by both
 * the client (CLI/UI) and server layers.
 *
 * IMPORTANT: Client code should depend on interfaces from this module,
 * NOT on concrete implementations from the server module.
 */

// Re-export all types
export * from "./types.js";

// Re-export all service interfaces
export * from "./services.js";
