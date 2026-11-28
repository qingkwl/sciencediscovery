// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { Type } from "typebox";
import { normalizeSpecialistRuntime } from "./config.js";
/** Main-agent configuration has no secret argument. Credential collection is
 * through the pending child card/API, outside persisted tool arguments. */
export function mainRuntimeConfigTool(store) {
    return {
        name: "configure_specialist_runtime", label: "Configure Specialist runtime",
        description: "Apply runtime settings requested by the user before delegating task(specialistId). Ask the user to enter tokens in the runtime's private configuration card when the task starts; never copy credentials into Specialist instructions, arguments, or settings. Changes apply to future tasks; active tasks keep their snapshot. Native specialists cannot be changed here.",
        parameters: Type.Object({ specialistId: Type.String(), settings: Type.Object({
                model: Type.Optional(Type.String()), fallback: Type.Optional(Type.Boolean()),
                timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 86400 })),
                reasoningEffort: Type.Optional(Type.Union([Type.Literal("minimal"), Type.Literal("low"), Type.Literal("medium"), Type.Literal("high"), Type.Literal("xhigh")])),
            }, { additionalProperties: false }) }, { additionalProperties: false }),
        execute: async (_id, raw) => {
            const args = raw;
            const specialist = store.getSpecialist(args.specialistId);
            if (!specialist || !specialist.runtime || specialist.runtime.kind === "native")
                throw new Error("Choose an external-runtime Specialist");
            const runtime = normalizeSpecialistRuntime({ ...specialist.runtime, ...args.settings });
            await store.updateSpecialist(specialist.id, { runtime });
            return { content: [{ type: "text", text: "Runtime settings saved. Delegate explicitly; any missing credential will open a private card in this conversation." }], details: { specialistId: specialist.id, runtime } };
        },
    };
}
