// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { createPluginScope, disabledPluginIds, validatePluginSettings, negotiatePlugins, ServiceRegistry } from "@sciencediscovery/plugin-sdk";
import { installedPlugins } from "./catalog.js";
import { planPlugin } from "@sciencediscovery/plan/plugin";
import { skillPlugin } from "@sciencediscovery/skill/plugin";
import { mcpPlugin } from "@sciencediscovery/mcp/plugin";
import { schedulerPlugin } from "@sciencediscovery/scheduler/plugin";
import { createEvolveTools } from "@sciencediscovery/evolve";
/** Build-time installation. Providers receive only their own domain ports. */
export function runtimePluginDefinitions(options) {
    return [
        skillPlugin({ skills: options.workspace.skills ?? [], createSkill: options.workspace.createSkill,
            proposeSkillLibraryUpdate: options.workspace.proposeSkillLibraryUpdate,
            publishSkillLibraryUpdate: options.workspace.publishSkillLibraryUpdate,
            toolPolicy: options.workspace.toolPolicy, durable: options.durable, scope: options.scope }),
        mcpPlugin({ mcpTools: options.workspace.mcpTools, toolPolicy: options.workspace.toolPolicy }),
        schedulerPlugin({ runSubagent: options.workspace.runSubagent, specialists: options.workspace.specialists, toolPolicy: options.workspace.toolPolicy, listArtifacts: options.workspace.listArtifacts }),
        ...(options.planStore ? [planPlugin(options.planStore, [options.scope])] : []),
        ...(options.evolve ? [{
                manifest: { id: "evolve", version: "0.1.0", apiVersion: 1 },
                create: () => ({ contribution: { tools: createEvolveTools(options.evolve), batchPolicies: [], contextFactories: [], stateProviders: [] } }),
            }] : []),
    ];
}
export async function createRuntimePluginScope(options, disabled = [], settings = {}) {
    const normalized = validatePluginSettings(settings, installedPlugins);
    const services = new ServiceRegistry();
    services.provide({ id: "skill.catalog", version: 1 }, options.workspace.skills ?? []);
    if (options.workspace.mcpTools)
        services.provide({ id: "mcp.tools", version: 1 }, options.workspace.mcpTools);
    if (options.workspace.runSubagent)
        services.provide({ id: "subagent.dispatch", version: 1 }, options.workspace.runSubagent);
    if (options.planStore)
        services.provide({ id: "plan.store", version: 1 }, options.planStore);
    const definitions = runtimePluginDefinitions({ ...options, workspace: { ...options.workspace,
            skills: services.require({ id: "skill.catalog", version: 1 }),
            mcpTools: services.require({ id: "mcp.tools", version: 1, optional: true }),
            runSubagent: services.require({ id: "subagent.dispatch", version: 1, optional: true }),
        }, planStore: services.require({ id: "plan.store", version: 1, optional: true }) });
    const known = new Set([...installedPlugins.map((item) => item.id), "evolve"]);
    for (const id of disabled)
        if (!known.has(id))
            throw new Error(`Unknown plugin: ${id}`);
    // Installed but currently unavailable plugins may still be configured/disabled.
    const statuses = negotiatePlugins([...installedPlugins.filter((item) => item.entries?.runtime),
        ...definitions.filter((item) => item.manifest.id === "evolve").map((item) => item.manifest)], { settings: normalized,
        services: services.describe(), permissions: ["runtime.contribute"] });
    const excluded = [...new Set([...disabled, ...disabledPluginIds(normalized),
            ...statuses.filter((item) => !item.available || !item.authorized).map((item) => item.id)])]
        .filter((id) => definitions.some((item) => item.manifest.id === id));
    const scope = await createPluginScope(definitions, excluded);
    let active = false;
    return {
        get manifests() { return scope.manifests; },
        get status() {
            return statuses.map((item) => ({ ...structuredClone(item),
                active: active && scope.manifests.some((manifest) => manifest.id === item.id) }));
        },
        contributions: scope.contributions,
        async start(signal) { await scope.start(signal); active = true; },
        async dispose() { active = false; await scope.dispose(); },
    };
}
