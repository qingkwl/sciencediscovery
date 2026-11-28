/** Runner publication receipts are installation-local; output evidence is portable. */
export function portableShellResult(result) {
    const { workspaceSnapshot: _snapshot, workspaceVersion: _version, ...portable } = result;
    return portable;
}
