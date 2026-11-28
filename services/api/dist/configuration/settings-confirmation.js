/** Shared Native/checkpoint and live-tool continuation semantics. */
export function settingsConfirmationInstruction(receipt) {
    return `The user reports ${receipt.completed ? "completing" : "not completing"} manual changes in ${receipt.destination} settings. This is a user self-report, not verification: no settings were written, verified or activated by this confirmation. Continue the original task using its actually available settings and tools; do not reapply the proposal, claim that changes are verified or effective, or ask this same configuration question again. If unavailable settings prevent progress, explain the limitation. Earlier pending tool results are historical, not a new user request.`;
}
