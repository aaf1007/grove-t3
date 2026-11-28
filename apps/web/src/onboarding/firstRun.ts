import { ensureClientSettingsHydrated, persistClientSettingsUpdate } from "../hooks/useSettings";

export async function completeOnboarding({ startTour = false } = {}): Promise<void> {
  await ensureClientSettingsHydrated();
  const onboardingCompletedAt = new Date().toISOString();
  await persistClientSettingsUpdate((current) => ({
    ...current,
    onboardingCompletedAt,
    workspaceTour:
      startTour && current.onboardingCompletedAt === null && current.workspaceTour === null
        ? { status: "active", step: "projects" }
        : current.workspaceTour,
  }));
}
