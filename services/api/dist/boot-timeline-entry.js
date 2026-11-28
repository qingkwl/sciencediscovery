// [W33-0] First-import boot anchor for the api Node process.
//
// ESM resolves the import list of `server.ts` (the process entry) in order,
// each module's own imports depth-first, BEFORE the entry module's body
// runs. The heaviest branch is `./http/index.js` (the whole API module
// graph). Because this module is imported FIRST and has no imports of its
// own, its body executes as early as ESM allows — stamping the wall clock
// before the heavy graph has been fetched or evaluated.
//
// Together with the stack's `stack-spawned` timestamp (parent side) and
// `service_started` (after listen), this splits the historical ~5.2s dark
// segment into:
//   spawn → entry0        node.exe boot + ESM graph load of the API tree
//   entry0 → service_started  boot logic (config, createApiServer, listen)
//
// Output goes to stdout with a stable `[boot-timeline]` marker: the api log
// file may not be attached this early in boot, but the process's stdout is
// captured by the stack runner log (run.log) from process start.
// Purely observational — no behavior, no failure path.
console.log(`[boot-timeline] entry0 ${new Date().toISOString()}`);
export {};
