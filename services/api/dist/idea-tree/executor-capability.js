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
import { IDEA_TREE_TEAM_CONTRACT, isIdeaTreeExecutorSkill, workflowExecutorDescriptor, } from "@sciencediscovery/idea-tree";
function declaredAuthority() {
    return {
        authorityKey: IDEA_TREE_TEAM_CONTRACT.resultAuthority.key,
        authorityVersion: IDEA_TREE_TEAM_CONTRACT.resultAuthority.version,
    };
}
function unavailable(declared, reason, developmentOnly = false) {
    return {
        capability: {
            ...declared,
            available: false,
            developmentOnly,
            reason,
        },
    };
}
/**
 * Resolve the one canonical Idea Tree Executor capability used by catalog,
 * Session validation, and Run queueing. New v5 Runs use the current Markdown
 * workflow; workflowSkill is accepted only to restore legacy exact snapshots.
 * Availability also requires the server-owned Result Authority.
 */
export async function resolveExecutorCapability(input) {
    const fallbackAuthority = declaredAuthority();
    let workflowSkill;
    try {
        const resolvedSkill = input.workflowSkill
            ? await input.skillCatalog.resolveRevision(input.workflowSkill)
            : input.skillCatalog.resolve([input.skillId])[0];
        if (!resolvedSkill)
            throw new Error(`Idea Tree Executor ${input.skillId} is not installed`);
        workflowSkill = resolvedSkill;
    }
    catch (error) {
        return unavailable(fallbackAuthority, error instanceof Error ? error.message : `Idea Tree Executor ${input.skillId} is unavailable`);
    }
    const authorityIdentity = declaredAuthority();
    if (!isIdeaTreeExecutorSkill(workflowSkill)) {
        return unavailable(authorityIdentity, `${input.skillId} is not an Idea Tree Workflow Skill`);
    }
    let executor;
    try {
        executor = workflowExecutorDescriptor(workflowSkill);
    }
    catch (error) {
        return unavailable(authorityIdentity, error instanceof Error ? error.message : "Idea Tree workflow contract is invalid");
    }
    let developmentOnly = false;
    try {
        developmentOnly = input.ideaTreeAuthorities.resolve(executor).developmentOnly;
    }
    catch (error) {
        return unavailable(authorityIdentity, error instanceof Error ? error.message : "Result Authority is unavailable");
    }
    return {
        capability: {
            ...authorityIdentity,
            available: true,
            developmentOnly,
        },
        executor,
        workflowSkill,
    };
}
