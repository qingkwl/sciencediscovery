/** CFG-R15: match a task word, not an accidental substring of a longer identifier.
 * ASCII letters, digits and underscores stay one word, so "api" does not match
 * "rapid" and "id" does not match "validate" or "session_id". Chinese has no
 * spaces, so "论文" still matches inside "找几篇论文", and "pubmed" still
 * matches inside "启用pubmed". */
export declare function configurationDiscoveryMatches(query: string, value: string): boolean;
