// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { randomUUID } from "node:crypto";
import { platformDecisionSchema, decisionInstructions, decisionCorrection, parsePlatformDecision, PlatformDecisionError } from "./decision-contract.js";
export { platformDecisionSchema } from "./decision-contract.js";
import { CodexRuntimeError, SpecialistUnavailableError } from "./codex.js";
/** Both transports are model-only. All code, files, network and artifacts use
 * validated platform tools and the child's live permission/Runner bindings. */
export async function runPlatformDecisions(request, sink, decide, result = { summary: "", artifacts: [] }) {
    const contract = `${request.prompt}\nReturn ONLY JSON matching ${JSON.stringify(platformDecisionSchema)}. ${decisionInstructions}\nTools: ${JSON.stringify(request.tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })))}`;
    const history = [];
    let dispatched = false;
    try {
        for (let turn = 0; turn < request.maxTurns; turn++) {
            request.signal.throwIfAborted();
            await sink({ type: "progress", text: `Specialist turn ${turn + 1}` });
            const prompt = `${contract}\nPlatform history: ${JSON.stringify(history).slice(-64000)}`;
            let decision;
            for (let attempt = 0; attempt < 2; attempt++) {
                const output = await decide(attempt ? `${prompt}\n${decisionCorrection}` : prompt);
                request.signal.throwIfAborted();
                try {
                    decision = parsePlatformDecision(output, request.tools);
                    break;
                }
                catch (error) {
                    if (!(error instanceof PlatformDecisionError))
                        throw error;
                    if (attempt === 1)
                        throw new CodexRuntimeError(`Invalid platform decision after one correction attempt: ${error.message}`);
                }
            }
            if (!decision.calls.length) {
                result.summary = decision.summary;
                await sink({ type: "done", result });
                return result;
            }
            for (const { tool, args } of decision.calls) {
                const id = randomUUID();
                await sink({ type: "tool_call", id, name: tool.name, args });
                request.signal.throwIfAborted();
                const previous = dispatched;
                dispatched ||= ["run_shell", "run_python", "run_scientific", "run_direct_shell", "declare_artifact"].includes(tool.name);
                const response = await tool.execute(id, args, request.signal);
                request.signal.throwIfAborted();
                const detail = response.details;
                if (detail?.code === "RUNNER_UNAVAILABLE" && detail.dispatched === false)
                    dispatched = previous;
                await sink({ type: "tool_call", id, name: tool.name, args, result: response });
                if (tool.name === "report_runtime_unavailable")
                    throw new SpecialistUnavailableError("Required runtime tools unavailable");
                if (tool.name === "declare_artifact" && !response.isError)
                    result.artifacts.push(response.details);
                history.push({ tool: tool.name, args, result: response });
            }
        }
        throw new CodexRuntimeError("Specialist exceeded maximum turns");
    }
    catch (error) {
        request.signal.throwIfAborted();
        if (error instanceof SpecialistUnavailableError && dispatched)
            throw new CodexRuntimeError("Runtime stopped after platform dispatch; review before retrying");
        if (error instanceof CodexRuntimeError)
            throw error;
        throw new CodexRuntimeError("Platform task failed; review before retrying");
    }
}
