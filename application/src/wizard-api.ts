// Wizard backend API calls (the model-config step was removed — models are
// configured from the main UI after entering the system, so the
// wizard ships only the final self-check). All decisions pure: fetch is
// injected, no Electron imports.
//
// Contracts verified against services/api:
//   GET /api/health (4410+N) → liveness for any caller; the deployment detail,
//     the Runner's body included, only with a bearer token
//   GET /api/settings → { overrides, effective } (modelConfigured display only)

export type WizardFetch = typeof fetch;

// --- shapes the wizard actually consumes (kept local & minimal) -------------

export interface SettingsResponse {
  overrides?: Record<string, unknown>;
  effective?: { modelId?: string | null };
}

/** The authenticated `/api/health` detail; a caller without a token gets only
 *  `{ service, liveness }`, so `runner` is the field that proves the detail. */
export interface HealthDetailResponse {
  runner?: { status?: string; execution?: { ready?: boolean } };
}

export interface SelfCheckResult {
  api: boolean;
  runner: boolean;
  /** null = runner endpoint not known (explicit-URL dev mode). */
  runnerChecked: boolean;
  /** Informational only — never gates entry (just-in-time config). */
  modelConfigured: boolean;
  /** Seatbelt probe (B2-2): "ok" on a capable macOS, "failed" gates entry
   *  FAIL-CLOSED (upstream red line: a failed probe must not pass go), and
   *  "not-applicable"/"unknown" never gate (Windows runs unsandboxed by
   *  design; a plain browser has no bridge to ask the shell). */
  seatbelt: "ok" | "failed" | "not-applicable" | "unknown";
  /** reason + diagnostics from the Seatbelt verdict, surfaced on the error
   *  page (empty unless seatbelt === "failed"). */
  seatbeltReason?: string;
  seatbeltDiagnostics?: string[];
  ok: boolean;
}

// --- helpers -----------------------------------------------------------------

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function fetchSettings(
  apiBase: string, token: string, fetchImpl: WizardFetch,
): Promise<SettingsResponse | null> {
  const res = await fetchImpl(`${apiBase}/api/settings`, { headers: authHeaders(token) });
  return res.ok ? res.json() as Promise<SettingsResponse> : null;
}

// --- self-check (no model hard gate) -------------------------------------------

/** Run once; the wizard page polls until green or gives up (env provisioning).
 * `seatbeltProbe` (optional, B2-2) is a pre-computed verdict from
 * sandbox-probe.ts's runSeatbeltProbe; omitting it (a plain browser path with
 * no shell bridge) reports "unknown", which never gates.
 * `directOptIn` ([mac-direct], optional): a darwin installation that opted
 * into direct execution was promised unsandboxed candidates, so a FAILED
 * probe is reported as "ok" with the failure kept in the reason fields — the
 * wizard page shows the same banner copy for both verdicts and nothing here
 * contradicts what the user chose in 设置. Default installs keep the
 * fail-closed short-circuit below. */
export async function runSelfCheck(
  apiBase: string, token: string, runnerBase: string | null, fetchImpl: WizardFetch,
  seatbeltProbe?: { kind: "ok" | "failed" | "not-applicable" } & Partial<{
    reason: string; diagnostics: string[];
  }>,
  directOptIn = false,
): Promise<SelfCheckResult> {
  const probeKind = directOptIn && seatbeltProbe?.kind === "failed" ? "ok" as const : null;
  const seatbelt = probeKind
    ?? (seatbeltProbe?.kind === "ok" || seatbeltProbe?.kind === "failed"
      ? seatbeltProbe.kind
      : seatbeltProbe?.kind === "not-applicable"
        ? "not-applicable"
        : "unknown");
  // reason/diagnostics are failure-page payload: they ride along whenever the
  // probe actually failed — that includes the [mac-direct] opt-in rewrite
  // above, where the verdict reads "ok" but the failure text stays for the
  // page to show beside the same banner copy (ok/not-applicable/unknown
  // verdicts that never failed have nothing to explain).
  const seatbeltDetail = seatbeltProbe?.kind === "failed" ? {
    ...(seatbeltProbe.reason ? { seatbeltReason: seatbeltProbe.reason } : {}),
    ...(seatbeltProbe.diagnostics?.length ? { seatbeltDiagnostics: seatbeltProbe.diagnostics } : {}),
  } : {};
  // Fail-closed (B2-2): a failed Seatbelt verdict gates entry regardless of
  // the other components — skip the backend round-trips, the user is not
  // getting in. (Upstream red line: the probe failure never passes go.)
  if (seatbelt === "failed") {
    return {
      api: false, runner: false, runnerChecked: false, modelConfigured: false,
      seatbelt,
      ...seatbeltDetail,
      ok: false,
    };
  }
  let api = false;
  let health: HealthDetailResponse | null = null;
  try {
    const res = await fetchImpl(`${apiBase}/api/health`, {
      headers: authHeaders(token), signal: AbortSignal.timeout(4000),
    });
    api = res.ok;
    if (api) health = await res.json() as HealthDetailResponse;
  } catch { /* down */ }
  // Readiness comes through the API, which forwards the Runner's own health
  // body: the Runner port answers an anonymous caller with liveness only, so a
  // direct probe cannot tell "ready" from "up" any more.
  const runner = health?.runner?.execution?.ready === true;
  let modelConfigured = false;
  if (api) {
    const settings = await fetchSettings(apiBase, token, fetchImpl);
    modelConfigured = Boolean(settings?.effective?.modelId);
  }
  return {
    api,
    runner,
    // Only meaningful when the shell knows a Runner to check; the readiness
    // itself is part of the API's authenticated answer.
    runnerChecked: runnerBase !== null,
    modelConfigured,
    seatbelt,
    ...seatbeltDetail,
    // No model gate — the user may enter unconfigured and set up
    // models from the main UI (the backend's 409 guidance covers first use).
    // Seatbelt "ok"/"not-applicable"/"unknown" never gates here: the probe
    // already ran (main.ts) before the stack was ever spawned.
    ok: api && (!runnerBase || runner),
  };
}
