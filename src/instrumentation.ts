export async function register() {
  if (process.env.NEXT_RUNTIME !== "edge") {
    const { startSheetAutoSyncScheduler } = await import("@/lib/sheet-auto-sync")
    startSheetAutoSyncScheduler()
  }
}
