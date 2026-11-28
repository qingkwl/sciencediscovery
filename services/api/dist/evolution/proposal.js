// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { SOLVED_THRESHOLD_BY_SCORING } from "@sciencediscovery/schema";
import { DEFAULT_MAX_SECONDS, DEFAULT_MAX_TOKENS, perCallCeiling } from "./call-budget.js";
import { EvolveSidecarError } from "./sidecar.js";
import { preflight } from "./preflight.js";
/** The gate is what every candidate's score is measured on — the number the
 *  tree ranks, selects and reports on — so it is the split a shortage hurts
 *  most, and the floor under it is the highest. The agent is told the reasoning
 *  in the skill; this is the floor under that. */
const MIN_GATE = 8;
/** The rollout drives the search's own trajectory. Four is enough for two
 *  genuinely different candidates to land on different numbers; one is not. */
const MIN_ROLLOUT = 4;
/** The rollout is what the tree ranks candidates with, and it is the split
 *  people forget: the gate has a floor and this had none. One rollout unit
 *  means every candidate is compared on a single measurement, and a coarse
 *  metric then hands them all the same number — observed as five candidates
 *  scoring exactly 0.6000 with the whole budget spent. */
function splitTooThin(split) {
    if (split.rolloutShards < MIN_ROLLOUT) {
        return `only ${split.rolloutShards} rollout shards means different candidates land on the `
            + `same score and the search has nothing to compare — use at least ${MIN_ROLLOUT}`;
    }
    if (split.gateShards < split.rolloutShards) {
        return `${split.gateShards} gate shards is fewer than the ${split.rolloutShards} rollout `
            + "shards. Every candidate's score — the number the tree ranks, selects and picks a "
            + "winner by — is measured on the gate alone, so it should be the largest of the three "
            + "rather than the smallest";
    }
    return undefined;
}
/**
 * A workspace path as the agent actually saw it, turned into one the store takes.
 *
 * The sandbox mounts the workspace at `/workspace`, so every path the agent
 * reads out of a tool result is absolute and starts there — writing it back
 * verbatim is the natural thing to do, and the store only accepts relative
 * paths. Stripping the mount point is not a weakening of that guard: anything
 * still absolute afterwards, and every `..`, is left for the guard to refuse.
 */
function workspaceRelative(path) {
    const trimmed = path.trim();
    if (trimmed === "/workspace")
        return "";
    return trimmed.startsWith("/workspace/") ? trimmed.slice("/workspace/".length) : trimmed;
}
/** Carries a problem the agent can fix back as a refusal rather than a crash.
 *  A path that cannot be read and an evaluator that does not carry the
 *  shard/result contract are the same kind of news: the design's author is
 *  right there and can change it. */
class ProposalRefusal extends Error {
}
/** The evaluator's text limit, matched to the tool's own `maxLength`. A file
 *  skips that parameter check, so the same ceiling is applied to what the file
 *  actually contains. */
const MAX_EVALUATOR_CHARS = 200_000;
/** The names an evaluator has to mention: the shard list it scores and the
 *  file it writes its result to. */
const EVALUATOR_MARKERS = ["SCIENCE_AGENT_SHARDS", "SCIENCE_AGENT_RESULT"];
/** Which proposal field a path came from, so a refusal can name it. */
async function storePath(deps, field, path) {
    try {
        return await deps.store({ path: workspaceRelative(path) });
    }
    catch (error) {
        throw new ProposalRefusal(`${field} points at ${path}, which cannot be read: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/** Refuse an evaluator whose text does not carry the contract.
 *
 *  The same check runs on both routes — inline text and a file's contents —
 *  because by then they are the same thing to the sidecar. The size ceiling
 *  lives here too: a path bypasses the tool's own `maxLength`, and the two are
 *  the same number. */
function checkEvaluator(text) {
    if (text.trim() === "") {
        throw new ProposalRefusal("the evaluator is empty — write the scoring script into "
            + "evaluatorSource, or into the file evaluatorPath points at");
    }
    if (text.length > MAX_EVALUATOR_CHARS) {
        throw new ProposalRefusal(`the evaluator is ${text.length} characters, past the ${MAX_EVALUATOR_CHARS}-character `
            + "limit. A large frozen table will not fit here as written: score by shard and build "
            + "each case from the shard index instead of carrying the whole table in the script, "
            + "or cut the table down");
    }
    for (const name of EVALUATOR_MARKERS) {
        if (!text.includes(name)) {
            throw new ProposalRefusal(`the evaluator never mentions ${name} — it has to score by shard and write its result `
                + "to the result file");
        }
    }
}
/** Store the evaluator and return its ref.
 *
 *  Inline text is checked before it is stored, so a rejected evaluator leaves
 *  nothing behind. A file is read only after it is stored, and by ref: the
 *  check has to be true of the bytes the run will execute, and those are the
 *  CAS copy, not the file on disk a moment later. */
async function storeEvaluator(proposal, deps) {
    if (proposal.evaluatorSource?.trim()) {
        const text = proposal.evaluatorSource;
        checkEvaluator(text);
        return deps.store({ content: text });
    }
    const cas = await storePath(deps, "evaluatorPath", proposal.evaluatorPath);
    let text;
    try {
        text = await deps.readText(cas);
    }
    catch (error) {
        throw new ProposalRefusal(`the evaluator was stored but cannot be read back: ${error instanceof Error ? error.message : String(error)}`);
    }
    checkEvaluator(text);
    return cas;
}
/**
 * Assemble, probe, pre-flight, start.
 *
 * Returns a refusal rather than throwing for anything the agent can fix, and
 * throws only when the environment is broken — the distinction matters because
 * the first is a conversation and the second is an incident.
 */
export async function startProposedRun(proposal, deps) {
    const shape = shapeOf(proposal);
    if (typeof shape === "string")
        return { refusedBecause: shape };
    // One search at a time per session. This is the guard behind the create
    // tool's wording: the description asks the agent to stop the running search
    // first, and this refuses the second start when it does not. Refused as data
    // so the agent can recover by calling stop_evolve_run, not as an exception
    // that reads like a broken tool.
    const active = deps.activeRuns ? await deps.activeRuns() : [];
    if (active.length) {
        const named = active.slice(0, 4).map((run) => `${run.id}（${run.status}）`).join("、");
        return {
            refusedBecause: `this session already has a search running: ${named}. One search owns `
                + "the session's budget and its frozen scoring, so a second one beside it would split the "
                + "budget and score against a different formula. Call stop_evolve_run on it, report that it "
                + "stopped, and then propose this search again.",
        };
    }
    // Probed before the goal is assembled, not after: whether this search runs
    // unconfined is a property of what the goal records, and a stray
    // `allowUnisolated` on a host with a real sandbox must not end up in it.
    const sandbox = await deps.orchestrator.sandboxCapability();
    let goal;
    try {
        goal = await assembleGoal(proposal, deps, sandbox);
    }
    catch (error) {
        // A path the agent got wrong is something it can fix, so it comes back as a
        // refusal naming the field. Anything else is this side breaking, and throws.
        if (error instanceof ProposalRefusal)
            return { refusedBecause: error.message };
        throw error;
    }
    const issues = await preflight({
        casHas: deps.casHas,
        goal,
        model: deps.model?.(goal.modelId),
        sandbox,
        thinkingSupported: deps.thinkingSupported,
    });
    if (issues.length)
        return { refusedBecause: describe(issues) };
    // The probe spends two real evaluations, so it runs after the cheap checks.
    let probe;
    try {
        probe = await deps.orchestrator.probe(goal, deps.sessionId);
    }
    catch (error) {
        // A 4xx is the probe's verdict on this design — "the starting point does
        // not run", "it is already past the threshold" — and the sidecar client
        // has already unwrapped it down to that sentence. Framing it again as
        // "the probe could not be carried out" contradicts it: the probe ran, and
        // this is what it found. Anything else really is an incident, and gets
        // said as one.
        const verdict = error instanceof EvolveSidecarError
            && error.status !== undefined && error.status >= 400 && error.status < 500;
        const said = error instanceof Error ? error.message : String(error);
        return { refusedBecause: verdict ? said : `the discrimination probe could not be taken: ${said}` };
    }
    if (probe.flat) {
        return {
            probe,
            // `flat` requires both numbers, so `worsened` is never null here — a
            // starting point that does not run is refused by the probe itself and
            // arrives on the catch path above with its own sentence.
            refusedBecause: `damaging the starting point (${probe.label}) barely moved the score (${probe.baseline.toFixed(4)} vs ${probe.worsened.toFixed(4)}) — this scoring cannot tell good from bad, and the search would wander a flat landscape. `
                + "Make the cases harder, the rubric more mechanical, or pick a more sensitive metric.",
        };
    }
    const run = await deps.orchestrator.start({ goal, sessionId: deps.sessionId });
    return { probe, run };
}
/** What this proposal is missing, or `undefined` when it is coherent.
 *
 *  Checked before anything is stored: a half-written proposal that already put
 *  an evaluator in the content store leaves a blob nobody chose. */
/** Beyond this the exploration term stops being a tie-breaker and starts
 *  outvoting the rank outright, which is a random walk with extra steps. */
const MAX_C_PUCT = 10;
/** Past this the prior stops aiming and starts deciding: at 4 a rating of 8
 *  against a mean of 5.5 is worth 4.5x a rating of 5, which overrides the
 *  measured ranking with an unmeasured opinion. */
const MAX_PRIOR_EXPONENT = 4;
function shapeOfSearchTuning(search) {
    if (!search)
        return undefined;
    if (search.cPuct !== undefined) {
        if (!Number.isFinite(search.cPuct) || search.cPuct <= 0) {
            return "cPuct has to be a positive number: it scales the exploration term, and zero or "
                + "negative leaves the search reading only the rank, or reading it backwards";
        }
        if (search.cPuct > MAX_C_PUCT) {
            return `cPuct ${search.cPuct} is too large: the exploration term would drown out the rank `
                + "and the search degenerates into a random walk. The usual range is 0.3-2.5";
        }
    }
    if (search.priorExponent !== undefined) {
        if (!Number.isFinite(search.priorExponent) || search.priorExponent < 0) {
            return "priorExponent has to be zero or a positive number: zero is the uniform prior "
                + "upstream ships, and a negative one would aim the search at what the model called "
                + "a dead end";
        }
        if (search.priorExponent > MAX_PRIOR_EXPONENT) {
            return `priorExponent ${search.priorExponent} is too large: the model's rating would `
                + "override the measured ranking rather than break its ties. 2 is upstream's own "
                + "non-zero setting";
        }
    }
    return undefined;
}
function hasJsonObjectStartingPoint(text) {
    const trimmed = text?.trim();
    if (!trimmed)
        return false;
    try {
        const value = JSON.parse(trimmed);
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
    catch {
        return false;
    }
}
/** The scoring modes `measureOf` can build a measure for. The tool's own schema
 *  offers the same set; this list is what a refusal can name, so one place
 *  decides the accepted values and the sentence that reports them. */
const PROPOSAL_MODES = [
    "dataset_metric", "test_gate", "custom_script", "llm_judge", "npu_job",
];
function isProposalMode(value) {
    return typeof value === "string" && PROPOSAL_MODES.includes(value);
}
/** Why a proposal's `mode` cannot be used, in the terms its author can act on. */
function modeProblem(mode) {
    const named = mode === undefined || mode === null
        ? "mode is missing"
        : `mode ${JSON.stringify(mode)} is not recognised`;
    return `${named}; it has to be one of ${PROPOSAL_MODES.join(", ")}. The scoring mode decides `
        + "how a candidate is measured, so a run without one has no scorecard to rank by";
}
function shapeOf(proposal) {
    // Checked first: every branch below reads the mode, and a proposal without
    // one used to fall all the way through `measureOf` and crash preflight with
    // `Cannot read properties of undefined (reading 'kind')` (#1318).
    if (!isProposalMode(proposal.mode))
        return modeProblem(proposal.mode);
    const needsStart = proposal.mode !== "test_gate";
    if (needsStart && !proposal.startingPointPath && !proposal.startingPointText?.trim()) {
        return "there is no starting point. Point startingPointPath at a file in the workspace, "
            + "or write the starting point into startingPointText";
    }
    if (proposal.expansions < proposal.workers * 4) {
        return `${proposal.workers} workers needs at least ${proposal.workers * 4} expansions, or `
            + "the first wave spends most of the budget forking only the root and the tree stays flat";
    }
    const tuning = shapeOfSearchTuning(proposal.search);
    if (tuning)
        return tuning;
    if (proposal.mode === "dataset_metric") {
        if (!proposal.datasetPath)
            return "dataset_metric needs a CSV";
        if (!proposal.targetColumn)
            return "dataset_metric needs the column to predict";
        if (!proposal.metric)
            return "dataset_metric needs a metric";
        if (!proposal.split)
            return "dataset_metric needs a split";
        if (proposal.split.gateShards < MIN_GATE) {
            return `only ${proposal.split.gateShards} held-out shards cannot tell an improvement `
                + "from noise";
        }
        const thin = splitTooThin(proposal.split);
        if (thin)
            return thin;
    }
    if (proposal.mode === "custom_script") {
        if (proposal.evaluatorSource?.trim() && proposal.evaluatorPath?.trim()) {
            return "custom_script takes evaluatorSource or evaluatorPath, not both — pass the text "
                + "inline, or point at the file that holds it";
        }
        if (!proposal.evaluatorSource?.trim() && !proposal.evaluatorPath?.trim()) {
            return "custom_script needs an evaluator script: write it into evaluatorSource, or put "
                + "it in a workspace file and point evaluatorPath at it";
        }
        if (!proposal.split) {
            return "custom_script needs a split, and its shard count has to match the one the "
                + "script slices";
        }
        if (proposal.split.gateShards < MIN_GATE) {
            return `only ${proposal.split.gateShards} held-out shards cannot tell an improvement `
                + "from noise";
        }
        const thin = splitTooThin(proposal.split);
        if (thin)
            return thin;
    }
    if (proposal.mode === "llm_judge") {
        if (!proposal.rubric?.trim())
            return "llm_judge needs a rubric";
        if (!proposal.split) {
            return "llm_judge needs a split: gateShards is how many held-out gradings the median "
                + "is taken over";
        }
        if (proposal.split.gateShards < MIN_GATE) {
            return `only ${proposal.split.gateShards} held-out gradings cannot show whether the grading `
                + "is wobbling";
        }
    }
    if (proposal.mode === "npu_job") {
        if (!proposal.evaluatorSource?.trim())
            return "npu_job needs the fixed program that computes the score";
        if (!proposal.editableFields?.length)
            return "npu_job needs editableFields: the JSON fields this run may change";
    }
    if (proposal.mode === "test_gate") {
        if (!proposal.testCmd?.trim())
            return "test_gate needs the command that runs the tests";
        if (!proposal.frozenGlobs?.length) {
            return "test_gate must freeze the test paths, or the shortest path to a higher score is "
                + "to weaken the tests";
        }
        if (!proposal.entrypointPath)
            return "test_gate needs the file a candidate replaces";
    }
    return undefined;
}
function describe(issues) {
    return issues.map((issue) => `${issue.message}（${issue.fix}）`).join("；");
}
const DEFAULT_SPLIT = {
    gateShards: 4, rolloutShards: 4, seed: 0, shardRows: 1, testShards: 0, trainRows: null,
};
const DEFAULT_CASE_SPLIT = {
    gateGroups: 4, rolloutGroups: 4, testGroups: 0,
};
/** The proposal's own text and paths, resolved into a goal. */
async function assembleGoal(proposal, deps, sandbox) {
    const now = new Date().toISOString();
    const split = proposal.split ?? DEFAULT_SPLIT;
    // Freeze the effective parent settings rather than independently defaulting
    // background mutations to disabled. The budget follows this same mode.
    const requestedThinking = proposal.thinking ?? deps.thinking ?? "auto";
    // "Off" is a budget plan only if the endpoint carries the request. A model on
    // a dialect with no thinking-control field ignores it and reasons anyway, and
    // the ceiling is then spent on hidden tokens: a custom gateway returned
    // exactly at 16k with no content on every expansion. Record what will
    // actually happen, so the ceiling and pre-flight's floor agree with the
    // model's behaviour rather than with the setting it was asked for.
    const thinking = requestedThinking === "disabled" && deps.thinkingSupported === false
        ? "enabled"
        : requestedThinking;
    // Keep the parent Run's effort in the frozen goal for `auto` as well. The
    // sidecar omits it at the provider boundary while auto is active; retaining
    // it here keeps the run snapshot complete and preserves the high fallback
    // when no effort was supplied. Disabled thinking remains effort-free because
    // strict providers reject an effort beside `thinking: disabled`.
    const thinkingEffort = thinking === "disabled"
        ? undefined
        : proposal.thinkingEffort ?? deps.thinkingEffort ?? "high";
    const startCas = proposal.mode === "test_gate"
        ? ""
        : proposal.startingPointPath
            ? await storePath(deps, "startingPointPath", proposal.startingPointPath)
            : await deps.store({ content: proposal.startingPointText });
    // Validate the bytes that the run will actually execute. A starting point
    // can come from either inline text or a workspace path; checking only the
    // proposal text rejects valid JSON files and would let a later file change
    // alter what the directed search starts from.
    if (proposal.mode !== "test_gate" && proposal.editableFields?.length) {
        let text;
        try {
            text = await deps.readText(startCas);
        }
        catch (error) {
            throw new ProposalRefusal(`the starting point was stored but cannot be read back: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!hasJsonObjectStartingPoint(text)) {
            throw new ProposalRefusal("editableFields requires a JSON object starting point; directed candidates without one "
                + "cannot use directed-search fields");
        }
    }
    // The scoring definition goes into the store and into `frozen`, which is what
    // stops a candidate rewriting what marks it. Same treatment for a rubric and
    // an evaluator: both are the scoring, in different languages.
    const scoringCas = proposal.mode === "llm_judge"
        ? await deps.store({ content: proposal.rubric })
        : proposal.mode === "npu_job"
            ? await deps.store({ content: proposal.evaluatorSource })
            : proposal.mode === "custom_script"
                ? await storeEvaluator(proposal, deps)
                : "";
    const measure = await measureOf(proposal, deps, split, scoringCas);
    const criterion = {
        direction: proposal.mode === "dataset_metric" ? (proposal.direction ?? "minimize") : "maximize",
        id: proposal.mode === "dataset_metric" ? (proposal.metric ?? "score") : "score",
        measure,
        name: proposal.howScored.slice(0, 60),
        normalize: normalizeOf(proposal),
        weight: 1,
    };
    const algorithm = proposal.algorithm ?? "puct";
    return {
        algorithm,
        baselineProgramCas: startCas,
        // Stated, never omitted: the run card reads this to say whether the search
        // was designed with pauses, and an absent field would only be read as
        // "confirm" anyway. An older client that never sends it keeps the old
        // behaviour.
        checkpointMode: proposal.checkpointMode ?? "confirm",
        // Written only when this run really does execute candidates unconfined.
        // The proposal's flag alone is not enough, twice over: it is the model's
        // argument rather than the user's answer, and a host with a sandbox that
        // somehow received it is still isolated — a goal claiming otherwise would
        // put a warning badge on a safe run.
        ...(sandbox.backend === "direct" && proposal.allowUnisolated === true && deps.approvedUnisolated
            ? { allowUnisolated: true }
            : {}),
        budget: {
            candidateTimeoutSeconds: 180,
            expansions: proposal.expansions,
            maxCostCents: 0,
            maxSeconds: DEFAULT_MAX_SECONDS,
            maxTokens: DEFAULT_MAX_TOKENS,
            // Enough for a reasoning model to think *and* answer when thinking is on;
            // a ceiling below that produced whole runs of hidden reasoning and no
            // program, which read as a model that could not write code. Keyed on the
            // algorithm because OpenEvolve's floor is higher than PUCT's — written as
            // one number once, the path refused its own default.
            maxTokensPerCall: perCallCeiling(algorithm, thinking),
            workers: proposal.workers,
        },
        frozen: scoringCas ? [scoringCas] : [],
        modelId: deps.modelId,
        ...(proposal.packages?.length ? { packages: proposal.packages } : {}),
        ...(proposal.search ? { search: proposal.search } : {}),
        scorecard: {
            aggregate: "weighted_sum",
            confirmedAt: now,
            confirmedBy: "agent",
            constraints: [],
            criteria: [criterion],
            derivedFrom: { draftRunId: "", statement: proposal.statement },
            hash: `sha256:agent-${proposal.mode}-${(scoringCas || startCas).slice(-12)}-${split.seed}`,
            schemaVersion: 1,
            ...(proposal.editableFields?.length
                ? { direction: { editable: proposal.editableFields } } : {}),
            // A graded scorer rarely reaches 0.999, and at the default every rollout
            // asks for a proposal and the run reports below-threshold — which reads
            // as the reflector failing when nothing was ever counted as done. The
            // per-mode values live in the schema, so a fifth scoring mode gets its
            // threshold from one place instead of two that drift apart.
            solvedThreshold: SOLVED_THRESHOLD_BY_SCORING[proposal.mode],
        },
        schemaVersion: 2,
        statement: proposal.statement,
        target: targetOf(proposal, startCas),
        thinking,
        thinkingEffort,
    };
}
function normalizeOf(proposal) {
    if (proposal.mode !== "dataset_metric")
        return { kind: "identity" };
    const kind = proposal.normalize ?? "reciprocal";
    // `clamp` needs bounds the proposal has no field for; anything asking for it
    // gets the shape that expresses the same intent without them.
    return kind === "clamp" ? { kind: "reciprocal" } : { kind };
}
function targetOf(proposal, startCas) {
    if (proposal.mode === "test_gate") {
        return {
            entrypoint: proposal.entrypointPath ?? "",
            kind: "program",
            programId: proposal.entrypointPath ?? "",
        };
    }
    if (proposal.mode === "llm_judge") {
        return { contentCas: startCas, kind: "text", label: proposal.statement.slice(0, 60) };
    }
    return {
        entrypoint: proposal.mode === "custom_script" ? "candidate.py" : "main.py",
        kind: "program",
        programId: startCas,
    };
}
async function measureOf(proposal, deps, split, scoringCas) {
    switch (proposal.mode) {
        case "dataset_metric": {
            const datasetCas = await storePath(deps, "datasetPath", proposal.datasetPath);
            return {
                datasetCas: [datasetCas],
                kind: "dataset_metric",
                metric: {
                    direction: proposal.direction ?? "minimize",
                    name: proposal.metric ?? "mae",
                },
                split,
                target: proposal.targetColumn,
            };
        }
        case "custom_script":
            return {
                kind: "custom_script", scriptCas: scoringCas, split, timeoutSeconds: 180,
            };
        case "npu_job":
            return { kind: "npu_job", scriptCas: scoringCas, timeoutSeconds: 180 };
        case "llm_judge":
            return {
                blind: true,
                judgeModelId: proposal.judgeModelId || deps.modelId,
                kind: "llm_judge",
                rubricCas: scoringCas,
                samplesPerCandidate: 1,
                scale: { max: proposal.scaleMax ?? 10, min: 0 },
                split: { ...split, shardRows: 1, trainRows: null },
                varianceThreshold: 0.2,
            };
        case "test_gate":
            return {
                caseSplit: proposal.caseSplit ?? DEFAULT_CASE_SPLIT,
                entrypoint: [proposal.entrypointPath ?? ""],
                frozen: proposal.frozenGlobs ?? [],
                kind: "test_gate",
                testCmd: proposal.testCmd.split(/\s+/).filter(Boolean),
            };
        default:
            // Unreachable through `startProposedRun` — `shapeOf` refuses an unknown
            // mode before the goal is assembled — but this is the reader that threw
            // the TypeError in #1318 when a proposal reached it without one. Answer
            // with a refusal naming the field so any other caller stays recoverable.
            throw new ProposalRefusal(modeProblem(proposal.mode));
    }
}
/**
 * A finished search, reduced to what is worth saying out loud.
 *
 * Read from the event log rather than the run record: the record carries
 * counters, and what a person wants is the shape of the outcome — did it beat
 * the start, by how much, and on the split that never took part. The last of
 * those is the only number quotable outside the run.
 */
export function summariseRun(run, events) {
    let baselineScore = null;
    let bestScore = null;
    let bestTestScore = null;
    let bestChange;
    let note;
    let stoppedEarly;
    // The winner is the node the engine names in `search_finished`, the same one
    // the orchestrator publishes; `null` there means nothing beat the seed. A
    // search still running has no winner yet.
    const hashByNode = new Map();
    let bestNodeIndex;
    for (const { event } of events) {
        const kind = event.type;
        if (kind === "seeded" && typeof event.baselineScore === "number") {
            baselineScore = event.baselineScore;
        }
        if (kind === "expanded" && event.valid === true && typeof event.score === "number") {
            if (bestScore === null || event.score > bestScore) {
                bestScore = event.score;
                bestChange = typeof event.changeSummary === "string" ? event.changeSummary : undefined;
            }
        }
        if (kind === "expanded" && typeof event.nodeIndex === "number" && typeof event.codeHash === "string") {
            hashByNode.set(event.nodeIndex, event.codeHash);
        }
        if (kind === "search_finished") {
            bestNodeIndex = typeof event.bestNodeIndex === "number" ? event.bestNodeIndex : null;
            if (typeof event.bestTestScore === "number")
                bestTestScore = event.bestTestScore;
            // A run that made 8 of its 20 expansions reports `succeeded` and a real
            // improvement, and nothing in the summary says it stopped a third of the
            // way in — which is the first thing anyone asks on seeing the tree. The
            // engine deliberately keeps quiet in the log about ordinary endings, so
            // this is where the shortfall becomes sayable.
            //
            // Measured in attempts, the population the round budget counts: a model
            // call that never returned still spent a round, so counting archive
            // growth called a completed six-round run truncated (#1457). Events
            // persisted before `attempts` existed fall back to the old arithmetic.
            const planned = typeof event.expansionsPlanned === "number" ? event.expansionsPlanned : null;
            const made = typeof event.attempts === "number"
                ? event.attempts
                : typeof event.candidates === "number" ? event.candidates - 1 : null;
            if (planned !== null && made !== null && made < planned) {
                const why = typeof event.stopReason === "string" && event.stopReason
                    ? event.stopReason
                    : "unknown";
                stoppedEarly = `planned ${planned} expansions, made ${made}; it stopped because ${why}`;
            }
        }
        // A run can finish `succeeded` having learned nothing — every score
        // identical, or nothing valid at all. The engine says so in a log line, and
        // that line is the most important thing about such a run.
        if (kind === "log" && (event.level === "warn" || event.level === "error")
            && typeof event.message === "string") {
            note = event.message;
        }
    }
    // Node 0 is the seed: it winning means nothing beat the starting point.
    const bestCodeHash = typeof bestNodeIndex === "number" && bestNodeIndex !== 0
        ? hashByNode.get(bestNodeIndex)
        : undefined;
    return {
        baselineScore,
        bestChange,
        bestCodeHash,
        bestScore,
        bestTestScore,
        candidates: run.candidates ?? 0,
        id: run.id,
        note,
        status: run.status,
        stoppedEarly,
        tokens: run.tokens ?? 0,
    };
}
