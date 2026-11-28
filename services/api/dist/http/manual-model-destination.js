/** Optimistic target check for manual settings, independent of Agent approvals. */
export function matchesManualModelDestination(profile, input) {
    if (!input || typeof input !== "object" || Array.isArray(input))
        return false;
    const value = input;
    if (typeof value.baseUrl !== "string" || value.profileUpdatedAt !== profile.updatedAt)
        return false;
    const normalized = (url) => new URL(url.trim()).href.replace(/\/+$/, "");
    try {
        return normalized(value.baseUrl) === normalized(profile.baseUrl);
    }
    catch {
        return false;
    }
}
