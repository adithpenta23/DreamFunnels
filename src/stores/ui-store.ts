import { create } from "zustand"

/**
 * Ephemeral, client-only UI state shared between components that aren't in a
 * parent/child relationship (e.g. the header's menu button and the nav links
 * inside the mobile sheet).
 *
 * Rules for Zustand in this codebase (see docs/ARCHITECTURE.md#state):
 * - Server data stays on the server (RSC + Server Actions); never mirror it here.
 * - Module-level stores like this one hold UI state only — nothing user- or
 *   request-specific — so sharing across SSR requests is harmless.
 * - Request/user-specific stores (e.g. the future funnel editor) must be
 *   created per mount via `createStore` + React context.
 */
type UIState = {
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>()((set) => ({
  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}))
