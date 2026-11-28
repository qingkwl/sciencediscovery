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
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { BUILT_IN_SKILL_LIBRARY_ID } from "@sciencediscovery/schema";
import { BUNDLED_SKILL_IDS, validateSkillPackage } from "@sciencediscovery/specialist";
const LIBRARY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_LIBRARY_RECALL_LIMIT = 12;
export class SkillLibraryCatalogError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function validationError(message) {
    return new SkillLibraryCatalogError("SKILL_LIBRARY_VALIDATION", message);
}
function decodePackage(input) {
    if (!input || !Array.isArray(input.files) || input.files.length === 0) {
        throw validationError("Skill library upsert package must contain files");
    }
    const files = new Map();
    for (const file of input.files) {
        if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
            throw validationError("Skill library package files must include path and content");
        }
        if (files.has(file.path))
            throw validationError(`Duplicate package file path: ${file.path}`);
        files.set(file.path, Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8"));
    }
    return files;
}
function versionContentHash(skills) {
    const hash = createHash("sha256");
    for (const skill of skills.toSorted((left, right) => left.id.localeCompare(right.id))) {
        hash.update(`${skill.id}\0${skill.hash}\0${skill.version}\n`);
    }
    return hash.digest("hex");
}
function diffSkills(before, after) {
    const beforeById = new Map(before.map((skill) => [skill.id, skill]));
    const afterById = new Map(after.map((skill) => [skill.id, skill]));
    const diff = { added: [], deleted: [], modified: [] };
    for (const [skillId, afterSkill] of afterById) {
        const beforeSkill = beforeById.get(skillId);
        if (!beforeSkill)
            diff.added.push({ after: afterSkill, skillId });
        else if (beforeSkill.hash !== afterSkill.hash || beforeSkill.version !== afterSkill.version) {
            diff.modified.push({ after: afterSkill, before: beforeSkill, skillId });
        }
    }
    for (const [skillId, beforeSkill] of beforeById) {
        if (!afterById.has(skillId))
            diff.deleted.push({ before: beforeSkill, skillId });
    }
    for (const entries of [diff.added, diff.deleted, diff.modified]) {
        entries.sort((left, right) => left.skillId.localeCompare(right.skillId));
    }
    return diff;
}
async function writePackageDirectory(root, files) {
    for (const [path, bytes] of files) {
        const target = resolve(root, ...path.split("/"));
        const relativeTarget = relative(root, target);
        if (!relativeTarget || relativeTarget === ".." || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
            throw validationError(`Unsafe skill package path: ${path}`);
        }
        await mkdir(resolve(target, ".."), { recursive: true });
        await writeFile(target, bytes, { flag: "wx" });
    }
}
async function readPackageDirectory(directory, prefix = "") {
    const files = new Map();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        const absolute = resolve(directory, entry.name);
        if (entry.isDirectory()) {
            for (const [childPath, bytes] of await readPackageDirectory(absolute, path))
                files.set(childPath, bytes);
        }
        else if (entry.isFile()) {
            files.set(path, await readFile(absolute));
        }
    }
    return files;
}
async function validateStoredPackageHash(directory, expectedHash) {
    const loaded = validateSkillPackage(await readPackageDirectory(directory));
    if (loaded.detail.hash !== expectedHash) {
        throw validationError(`Stored skill package hash does not match content: ${expectedHash}`);
    }
}
function queryTerms(query) {
    return [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 2))];
}
function scoreSkill(skill, query) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery)
        return 0;
    const id = skill.id.toLowerCase();
    const description = skill.description.toLowerCase();
    if (id === normalizedQuery)
        return 100;
    let score = id.includes(normalizedQuery) ? 40 : description.includes(normalizedQuery) ? 20 : 0;
    for (const term of queryTerms(query)) {
        if (id === term)
            score += 12;
        else if (id.includes(term))
            score += 6;
        if (description.includes(term))
            score += 3;
    }
    return score;
}
function packageInputFromFiles(files) {
    return {
        files: [...files].map(([path, content]) => ({
            content: content.toString("base64"),
            encoding: "base64",
            path,
        })).toSorted((left, right) => left.path.localeCompare(right.path)),
    };
}
function diffCount(diff) {
    return diff.added.length + diff.deleted.length + diff.modified.length;
}
export class SkillLibraryCatalog {
    index = { libraries: {}, schemaVersion: 1 };
    loaded = false;
    mutationQueue = Promise.resolve();
    root;
    constructor(dataDir) {
        this.root = resolve(dataDir, "skill-libraries");
    }
    get indexPath() {
        return resolve(this.root, "catalog.json");
    }
    libraryRoot(libraryId) {
        return resolve(this.root, "libraries", libraryId);
    }
    packageRoot(hash) {
        return resolve(this.root, "packages", "sha256", hash.slice(0, 2), hash, "package");
    }
    versionPath(libraryId, versionId) {
        return resolve(this.libraryRoot(libraryId), "versions", `${versionId}.json`);
    }
    async saveIndex() {
        const temporary = resolve(this.root, `.catalog-${randomUUID()}.json`);
        await writeFile(temporary, `${JSON.stringify(this.index, null, 2)}\n`, { flag: "wx" });
        await rename(temporary, this.indexPath);
    }
    async load() {
        if (this.loaded)
            return;
        await mkdir(this.root, { recursive: true });
        for (const entry of await readdir(this.root, { withFileTypes: true }).catch(() => [])) {
            if (entry.name.startsWith(".catalog-"))
                await rm(resolve(this.root, entry.name), { force: true, recursive: true });
        }
        try {
            const saved = JSON.parse(await readFile(this.indexPath, "utf8"));
            if (saved.schemaVersion !== 1 || !saved.libraries || typeof saved.libraries !== "object") {
                throw validationError("Skill library catalog has an unsupported schema");
            }
            this.index = { proposals: {}, ...saved };
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
            await this.saveIndex();
        }
        this.loaded = true;
    }
    assertLoaded() {
        if (!this.loaded)
            throw new Error("Skill library catalog is not loaded");
    }
    async mutate(operation) {
        const previous = this.mutationQueue;
        let release;
        this.mutationQueue = new Promise((resolveRelease) => { release = resolveRelease; });
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
    list() {
        this.assertLoaded();
        return Object.values(this.index.libraries)
            .map((library) => structuredClone(library))
            .toSorted((left, right) => left.name.localeCompare(right.name));
    }
    get(libraryId) {
        this.assertLoaded();
        return this.index.libraries[libraryId] ? structuredClone(this.index.libraries[libraryId]) : undefined;
    }
    listProposals(libraryId) {
        this.assertLoaded();
        return Object.values(this.index.proposals ?? {})
            .filter((proposal) => !libraryId || proposal.libraryId === libraryId)
            .map((proposal) => structuredClone(proposal))
            .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
    }
    getProposal(proposalId) {
        this.assertLoaded();
        const proposal = this.index.proposals?.[proposalId];
        return proposal ? structuredClone(proposal) : undefined;
    }
    async create(input = {}) {
        return await this.mutate(async () => {
            this.assertLoaded();
            const id = input.id?.trim() || randomUUID();
            if (input.id && (!LIBRARY_ID.test(id) || id.length > 64)) {
                throw validationError("Skill library id must contain 1-64 lowercase letters, digits, or single hyphens");
            }
            if (this.index.libraries[id])
                throw new SkillLibraryCatalogError("SKILL_LIBRARY_CONFLICT", `Skill library already exists: ${id}`);
            const now = new Date().toISOString();
            const library = {
                createdAt: now,
                id,
                name: input.name?.trim() || id,
                updatedAt: now,
            };
            this.index.libraries[id] = library;
            try {
                await mkdir(resolve(this.libraryRoot(id), "versions"), { recursive: true });
                await this.saveIndex();
            }
            catch (error) {
                delete this.index.libraries[id];
                throw error;
            }
            return structuredClone(library);
        });
    }
    async seedBuiltInSkillLibrary(repositoryRoot) {
        this.assertLoaded();
        const library = this.get(BUILT_IN_SKILL_LIBRARY_ID)
            ?? await this.create({ id: BUILT_IN_SKILL_LIBRARY_ID, name: "Built-in Skills" });
        const current = library.headVersionId ? await this.getVersion(library.id, library.headVersionId) : undefined;
        const bundledIds = new Set(BUNDLED_SKILL_IDS);
        const operations = [];
        for (const id of BUNDLED_SKILL_IDS) {
            operations.push({
                package: packageInputFromFiles(await readPackageDirectory(resolve(repositoryRoot, "skills", id))),
                type: "upsert",
            });
        }
        for (const skill of current?.skills ?? []) {
            if (!bundledIds.has(skill.id))
                operations.push({ skillId: skill.id, type: "delete" });
        }
        const preview = await this.commitVersion(library.id, {
            author: { kind: "system", name: "Built-in skill catalog" },
            baseVersionId: library.headVersionId,
            dryRun: true,
            operations,
        });
        if (!diffCount(preview.diff))
            return this.get(library.id);
        const committed = await this.commitVersion(library.id, {
            author: { kind: "system", name: "Built-in skill catalog" },
            baseVersionId: library.headVersionId,
            operations,
        });
        if (committed.conflicts.length) {
            throw validationError(committed.conflicts.map((conflict) => conflict.message).join(" "));
        }
        return this.get(library.id);
    }
    async getVersion(libraryId, versionId) {
        this.assertLoaded();
        if (!this.index.libraries[libraryId]) {
            throw new SkillLibraryCatalogError("SKILL_LIBRARY_NOT_FOUND", `Skill library not found: ${libraryId}`);
        }
        try {
            return JSON.parse(await readFile(this.versionPath(libraryId, versionId), "utf8"));
        }
        catch (error) {
            if (error.code === "ENOENT") {
                throw new SkillLibraryCatalogError("SKILL_LIBRARY_NOT_FOUND", `Skill library version not found: ${versionId}`);
            }
            throw error;
        }
    }
    async listVersions(libraryId) {
        this.assertLoaded();
        if (!this.index.libraries[libraryId]) {
            throw new SkillLibraryCatalogError("SKILL_LIBRARY_NOT_FOUND", `Skill library not found: ${libraryId}`);
        }
        const versionsRoot = resolve(this.libraryRoot(libraryId), "versions");
        const versions = [];
        for (const entry of await readdir(versionsRoot).catch(() => [])) {
            if (entry.endsWith(".json"))
                versions.push(JSON.parse(await readFile(resolve(versionsRoot, entry), "utf8")));
        }
        return versions.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
    }
    async persistPackage(hash, files) {
        const destination = this.packageRoot(hash);
        let created = false;
        try {
            await mkdir(resolve(destination, ".."), { recursive: true });
            await mkdir(destination, { recursive: false });
            created = true;
            await writePackageDirectory(destination, files);
        }
        catch (error) {
            if (error.code !== "EEXIST")
                throw error;
        }
        finally {
            if (created) {
                try {
                    await validateStoredPackageHash(destination, hash);
                }
                catch (error) {
                    await rm(destination, { force: true, recursive: true });
                    throw error;
                }
            }
        }
    }
    async buildCommit(libraryId, request, rollbackOfVersionId) {
        const library = this.index.libraries[libraryId];
        if (!library)
            throw new SkillLibraryCatalogError("SKILL_LIBRARY_NOT_FOUND", `Skill library not found: ${libraryId}`);
        if (!request.author || !["self-evolution", "system", "user"].includes(request.author.kind)) {
            throw validationError("Skill library commit author.kind is required");
        }
        if (!Array.isArray(request.operations))
            throw validationError("Skill library commit operations must be an array");
        const base = request.baseVersionId ? await this.getVersion(libraryId, request.baseVersionId) : undefined;
        const currentHead = library.headVersionId ? await this.getVersion(libraryId, library.headVersionId) : undefined;
        const conflicts = [];
        if (library.headVersionId !== request.baseVersionId) {
            conflicts.push({
                code: "STALE_BASE_VERSION",
                message: `Base version ${request.baseVersionId ?? "(empty)"} does not match head ${library.headVersionId ?? "(empty)"}`,
            });
        }
        const nextSkills = new Map((base?.skills ?? []).map((skill) => [skill.id, skill]));
        const packages = new Map();
        const diagnostics = [];
        const touched = new Set();
        for (const operation of request.operations) {
            if (operation.type === "upsert") {
                const loaded = validateSkillPackage(decodePackage(operation.package));
                if (touched.has(loaded.detail.id)) {
                    conflicts.push({ code: "DUPLICATE_OPERATION", message: `Skill is edited more than once: ${loaded.detail.id}`, skillId: loaded.detail.id });
                    continue;
                }
                touched.add(loaded.detail.id);
                diagnostics.push(...loaded.detail.diagnostics);
                packages.set(loaded.detail.hash, loaded.files);
                nextSkills.set(loaded.detail.id, {
                    ...(loaded.detail.declaredVersion ? { declaredVersion: loaded.detail.declaredVersion } : {}),
                    description: loaded.detail.description,
                    hash: loaded.detail.hash,
                    id: loaded.detail.id,
                    version: loaded.detail.version,
                });
            }
            else if (operation.type === "delete") {
                const skillId = operation.skillId?.trim();
                if (!skillId)
                    throw validationError("Skill library delete operation requires skillId");
                if (touched.has(skillId)) {
                    conflicts.push({ code: "DUPLICATE_OPERATION", message: `Skill is edited more than once: ${skillId}`, skillId });
                    continue;
                }
                touched.add(skillId);
                if (!nextSkills.delete(skillId)) {
                    conflicts.push({ code: "DELETE_MISSING_SKILL", message: `Skill is not present in the base version: ${skillId}`, skillId });
                }
            }
            else {
                throw validationError("Unsupported skill library operation type");
            }
        }
        const skills = [...nextSkills.values()].toSorted((left, right) => left.id.localeCompare(right.id));
        const createdAt = new Date().toISOString();
        const version = {
            author: structuredClone(request.author),
            ...(base ? { baseVersionId: base.id, parentVersionId: base.id } : {}),
            contentHash: versionContentHash(skills),
            createdAt,
            ...(request.evaluation ? { evaluation: structuredClone(request.evaluation) } : {}),
            id: randomUUID(),
            libraryId,
            ...(rollbackOfVersionId ? { rollbackOfVersionId } : {}),
            skills,
        };
        return {
            conflicts,
            diagnostics,
            diff: diffSkills(currentHead?.skills ?? [], skills),
            packages,
            version,
        };
    }
    async commitVersion(libraryId, request) {
        return await this.mutate(async () => {
            this.assertLoaded();
            const built = await this.buildCommit(libraryId, request);
            if (request.dryRun || built.conflicts.length) {
                return {
                    conflicts: built.conflicts,
                    diagnostics: built.diagnostics,
                    diff: built.diff,
                    dryRun: Boolean(request.dryRun),
                    ...(request.dryRun ? { version: built.version } : {}),
                };
            }
            await this.publishVersion(libraryId, built.version, built.packages);
            return {
                conflicts: [],
                diagnostics: built.diagnostics,
                diff: built.diff,
                dryRun: false,
                version: structuredClone(built.version),
            };
        });
    }
    async proposeUpdate(libraryId, request) {
        return await this.mutate(async () => {
            this.assertLoaded();
            if (libraryId === BUILT_IN_SKILL_LIBRARY_ID) {
                throw validationError("Built-in skill libraries are read-only and cannot receive self-evolution proposals");
            }
            if (!request.rationale?.trim())
                throw validationError("Skill library update proposal requires rationale");
            if (!request.sourceRefs?.length)
                throw validationError("Skill library update proposal requires sourceRefs");
            const dryRunRequest = {
                ...structuredClone(request),
                author: { ...request.author, kind: "self-evolution" },
                dryRun: true,
            };
            const built = await this.buildCommit(libraryId, dryRunRequest);
            const result = {
                conflicts: built.conflicts,
                diagnostics: built.diagnostics,
                diff: built.diff,
                dryRun: true,
                version: structuredClone(built.version),
            };
            const now = new Date().toISOString();
            const proposal = {
                ...(dryRunRequest.baseVersionId ? { baseVersionId: dryRunRequest.baseVersionId } : {}),
                createdAt: now,
                id: randomUUID(),
                libraryId,
                rationale: request.rationale.trim(),
                request: dryRunRequest,
                result,
                sourceRefs: structuredClone(request.sourceRefs),
                status: "pending",
                updatedAt: now,
            };
            this.index.proposals ??= {};
            this.index.proposals[proposal.id] = proposal;
            await this.saveIndex();
            return structuredClone(proposal);
        });
    }
    async rejectProposal(proposalId) {
        return await this.mutate(async () => {
            this.assertLoaded();
            const proposal = this.index.proposals?.[proposalId];
            if (!proposal)
                throw new SkillLibraryCatalogError("SKILL_LIBRARY_NOT_FOUND", `Skill library update proposal not found: ${proposalId}`);
            if (proposal.status === "published")
                throw validationError("Published skill library update proposals cannot be rejected");
            proposal.status = "rejected";
            proposal.updatedAt = new Date().toISOString();
            await this.saveIndex();
            return structuredClone(proposal);
        });
    }
    async publishProposal(proposalId) {
        const published = await this.publishProposals([proposalId]);
        return {
            proposal: published.proposals[0],
            result: published.result,
        };
    }
    async publishProposals(proposalIds) {
        return await this.mutate(async () => {
            this.assertLoaded();
            const uniqueProposalIds = Array.from(new Set(proposalIds.map((id) => id.trim()).filter(Boolean)));
            if (!uniqueProposalIds.length)
                throw validationError("At least one skill library update proposal is required");
            if (uniqueProposalIds.length > 50)
                throw validationError("At most 50 skill library update proposals can be published at once");
            const proposals = uniqueProposalIds.map((proposalId) => {
                const proposal = this.index.proposals?.[proposalId];
                if (!proposal)
                    throw new SkillLibraryCatalogError("SKILL_LIBRARY_NOT_FOUND", `Skill library update proposal not found: ${proposalId}`);
                if (proposal.status !== "pending")
                    throw validationError(`Skill library update proposal ${proposalId} is ${proposal.status}`);
                return proposal;
            });
            const [first] = proposals;
            const libraryId = first.libraryId;
            if (libraryId === BUILT_IN_SKILL_LIBRARY_ID) {
                throw validationError("Built-in skill libraries are read-only and cannot publish self-evolution proposals");
            }
            if (proposals.some((proposal) => proposal.libraryId !== libraryId)) {
                throw validationError("Skill library update proposals must belong to the same library");
            }
            const library = this.index.libraries[libraryId];
            if (!library)
                throw new SkillLibraryCatalogError("SKILL_LIBRARY_NOT_FOUND", `Skill library not found: ${libraryId}`);
            const request = {
                author: { kind: "self-evolution", name: uniqueProposalIds.length === 1 ? "Agent self-evolution proposal" : "Merged agent self-evolution proposals" },
                baseVersionId: library.headVersionId,
                dryRun: false,
                evaluation: { proposalIds: uniqueProposalIds },
                operations: proposals.flatMap((proposal) => structuredClone(proposal.request.operations)),
            };
            const built = await this.buildCommit(libraryId, request);
            if (built.conflicts.length) {
                return {
                    proposals: structuredClone(proposals),
                    result: {
                        conflicts: built.conflicts,
                        diagnostics: built.diagnostics,
                        diff: built.diff,
                        dryRun: false,
                    },
                };
            }
            await this.publishVersion(libraryId, built.version, built.packages);
            const now = new Date().toISOString();
            for (const proposal of proposals) {
                proposal.status = "published";
                proposal.publishedVersionId = built.version.id;
                proposal.updatedAt = now;
            }
            await this.saveIndex();
            return {
                proposals: structuredClone(proposals),
                result: {
                    conflicts: [],
                    diagnostics: built.diagnostics,
                    diff: built.diff,
                    dryRun: false,
                    version: structuredClone(built.version),
                },
            };
        });
    }
    async publishVersion(libraryId, version, packages) {
        const library = this.index.libraries[libraryId];
        for (const [hash, files] of packages)
            await this.persistPackage(hash, files);
        const versionPath = this.versionPath(libraryId, version.id);
        await mkdir(resolve(versionPath, ".."), { recursive: true });
        await writeFile(versionPath, `${JSON.stringify(version, null, 2)}\n`, { flag: "wx" });
        const previous = structuredClone(library);
        library.headVersionId = version.id;
        library.updatedAt = version.createdAt;
        try {
            await this.saveIndex();
        }
        catch (error) {
            this.index.libraries[libraryId] = previous;
            await rm(versionPath, { force: true });
            throw error;
        }
    }
    async diffVersions(libraryId, fromVersionId, toVersionId) {
        const [fromVersion, toVersion] = await Promise.all([
            this.getVersion(libraryId, fromVersionId),
            this.getVersion(libraryId, toVersionId),
        ]);
        return diffSkills(fromVersion.skills, toVersion.skills);
    }
    async resolveEnabledRefs(libraries) {
        this.assertLoaded();
        if (!libraries?.length)
            return [];
        const refs = [];
        const seen = new Set();
        for (const mount of libraries) {
            const libraryId = mount.libraryId.trim();
            const library = this.index.libraries[libraryId];
            if (!library)
                throw new SkillLibraryCatalogError("SKILL_LIBRARY_NOT_FOUND", `Skill library not found: ${libraryId}`);
            const requestedVersionId = mount.versionId?.trim();
            const versionId = !requestedVersionId || requestedVersionId === "head" ? library.headVersionId : requestedVersionId;
            if (!versionId)
                throw validationError(`Skill library has no head version: ${libraryId}`);
            const version = await this.getVersion(libraryId, versionId);
            const key = `${libraryId}\0${version.id}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            refs.push({ contentHash: version.contentHash, libraryId, versionId: version.id });
        }
        return refs;
    }
    async search(request) {
        this.assertLoaded();
        const limit = Math.min(Math.max(request.limit ?? DEFAULT_LIBRARY_RECALL_LIMIT, 1), 100);
        const refs = [];
        const candidates = [];
        const conflicts = [];
        const bestBySkillId = new Map();
        const seenRefs = new Set();
        for (const libraryRef of request.libraries) {
            const libraryId = libraryRef.libraryId.trim();
            const versionId = libraryRef.versionId.trim();
            const version = await this.getVersion(libraryId, versionId);
            if (libraryRef.contentHash && libraryRef.contentHash !== version.contentHash) {
                throw validationError(`Skill library reference hash mismatch for ${libraryId}@${versionId}`);
            }
            const refKey = `${libraryId}\0${versionId}`;
            if (!seenRefs.has(refKey)) {
                refs.push({ contentHash: version.contentHash, libraryId, versionId });
                seenRefs.add(refKey);
            }
            const priority = libraryRef.priority ?? 0;
            const perLibraryLimit = Math.min(Math.max(libraryRef.limit ?? limit, 1), 100);
            for (const candidate of version.skills
                .map((skill) => ({ libraryId, priority, score: scoreSkill(skill, request.query), skill, versionId }))
                .filter((candidate) => candidate.score > 0)
                .toSorted((left, right) => right.score - left.score || left.skill.id.localeCompare(right.skill.id))
                .slice(0, perLibraryLimit)) {
                const current = bestBySkillId.get(candidate.skill.id);
                if (!current || candidate.priority > current.priority || (candidate.priority === current.priority && candidate.score > current.score)) {
                    bestBySkillId.set(candidate.skill.id, candidate);
                }
                else if (current.priority === candidate.priority && current.skill.hash !== candidate.skill.hash) {
                    conflicts.push({
                        code: "DUPLICATE_SKILL_PRIORITY_CONFLICT",
                        message: `Skill ${candidate.skill.id} appears with different hashes at priority ${candidate.priority}`,
                        skillId: candidate.skill.id,
                    });
                }
            }
        }
        candidates.push(...bestBySkillId.values());
        candidates.sort((left, right) => right.priority - left.priority || right.score - left.score || left.skill.id.localeCompare(right.skill.id));
        return {
            candidates: candidates.slice(0, limit).map((candidate) => structuredClone(candidate)),
            conflicts,
            skillLibraryRefs: refs.toSorted((left, right) => `${left.libraryId}/${left.versionId}`.localeCompare(`${right.libraryId}/${right.versionId}`)),
        };
    }
    async resolveSkills(candidates) {
        this.assertLoaded();
        const snapshots = [];
        for (const candidate of candidates) {
            const files = await this.readStoredPackage(candidate.skill.hash);
            const loaded = validateSkillPackage(files);
            const detail = structuredClone(loaded.detail);
            const clonedFiles = new Map([...loaded.files].map(([path, bytes]) => [path, Buffer.from(bytes)]));
            snapshots.push({
                content: detail.instructions,
                description: detail.description,
                hash: detail.hash,
                id: detail.id,
                metadata: structuredClone(detail.metadata ?? {}),
                readResource: (path) => {
                    const resource = detail.resources.find((item) => item.path === path);
                    const bytes = clonedFiles.get(path);
                    if (!resource || !bytes)
                        throw validationError(`Skill resource not found: ${path}`);
                    return {
                        content: bytes.toString("utf8"),
                        hash: resource.hash,
                        path: resource.path,
                        revision: detail.currentRevision,
                        skillId: detail.id,
                        size: resource.size,
                    };
                },
                readPackageFiles: () => [...clonedFiles]
                    .map(([path, bytes]) => ({
                    bytes: Buffer.from(bytes),
                    hash: createHash("sha256").update(bytes).digest("hex"),
                    path,
                    size: bytes.length,
                }))
                    .toSorted((left, right) => left.path.localeCompare(right.path)),
                resources: structuredClone(detail.resources),
                revision: detail.currentRevision,
                version: detail.version,
            });
        }
        return snapshots;
    }
    async validateRefs(refs) {
        this.assertLoaded();
        if (!refs?.length)
            return [];
        const seen = new Set();
        const validated = [];
        for (const ref of refs) {
            const libraryId = ref.libraryId?.trim();
            const versionId = ref.versionId?.trim();
            const contentHash = ref.contentHash?.trim();
            if (!libraryId || !versionId || !contentHash) {
                throw validationError("Skill library references require libraryId, versionId, and contentHash");
            }
            const key = `${libraryId}\0${versionId}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            const version = await this.getVersion(libraryId, versionId);
            if (version.contentHash !== contentHash) {
                throw validationError(`Skill library reference hash mismatch for ${libraryId}@${versionId}`);
            }
            validated.push({ contentHash, libraryId, versionId });
        }
        return validated.toSorted((left, right) => `${left.libraryId}/${left.versionId}`.localeCompare(`${right.libraryId}/${right.versionId}`));
    }
    async rollback(libraryId, request) {
        return await this.mutate(async () => {
            this.assertLoaded();
            if (!request.author || !["self-evolution", "system", "user"].includes(request.author.kind)) {
                throw validationError("Skill library rollback author.kind is required");
            }
            const target = await this.getVersion(libraryId, request.targetVersionId);
            const library = this.index.libraries[libraryId];
            const current = library.headVersionId ? await this.getVersion(libraryId, library.headVersionId) : undefined;
            const currentById = new Map((current?.skills ?? []).map((skill) => [skill.id, skill]));
            const targetById = new Map(target.skills.map((skill) => [skill.id, skill]));
            const conflicts = [];
            if (library.headVersionId !== request.baseVersionId) {
                conflicts.push({
                    code: "STALE_BASE_VERSION",
                    message: `Base version ${request.baseVersionId ?? "(empty)"} does not match head ${library.headVersionId ?? "(empty)"}`,
                });
            }
            if (conflicts.length) {
                return { conflicts, diagnostics: [], diff: diffSkills(current?.skills ?? [], target.skills), dryRun: false };
            }
            const packages = new Map();
            for (const skill of target.skills) {
                packages.set(skill.hash, await this.readStoredPackage(skill.hash));
            }
            const version = {
                author: structuredClone(request.author),
                ...(current ? { baseVersionId: current.id, parentVersionId: current.id } : {}),
                contentHash: target.contentHash,
                createdAt: new Date().toISOString(),
                ...(request.evaluation ? { evaluation: structuredClone(request.evaluation) } : {}),
                id: randomUUID(),
                libraryId,
                rollbackOfVersionId: target.id,
                skills: [...targetById.values()].toSorted((left, right) => left.id.localeCompare(right.id)),
            };
            const diff = diffSkills([...currentById.values()], version.skills);
            await this.publishVersion(libraryId, version, packages);
            return { conflicts: [], diagnostics: [], diff, dryRun: false, version: structuredClone(version) };
        });
    }
    async readStoredPackage(hash, directory = this.packageRoot(hash), prefix = "") {
        const files = new Map();
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const childPath = prefix ? `${prefix}/${entry.name}` : entry.name;
            const absolute = resolve(directory, entry.name);
            if (entry.isDirectory()) {
                for (const [path, bytes] of await this.readStoredPackage(hash, absolute, childPath))
                    files.set(path, bytes);
            }
            else if (entry.isFile()) {
                files.set(childPath, await readFile(absolute));
            }
        }
        return files;
    }
}
