/** External children share the live permission cell, but never inherit a
 * native backend's claim that its own approval engine already authorized code. */
export function routeSpecialistPermissions(native, platform, externalExecutions) {
    return (action, resource, summary, context) => (context?.executionId && externalExecutions.has(context.executionId) ? platform : native)(action, resource, summary, context);
}
