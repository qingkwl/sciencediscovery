import type { CommitSkillLibraryVersionRequest, CommitSkillLibraryVersionResult, EnabledSkillLibrary, ProposeSkillLibraryUpdateRequest, PublishSkillLibraryUpdateProposalResult, PublishSkillLibraryUpdateProposalsResult, PromptSkillLibraryRef, SkillLibrary, SkillLibrarySearchCandidate, SkillLibrarySearchRequest, SkillLibrarySearchResult, SkillLibraryDiff, SkillLibraryUpdateProposal, SkillLibraryVersion, RollbackSkillLibraryVersionRequest } from "@sciencediscovery/schema";
import type { RuntimeSkillSnapshot } from "@sciencediscovery/specialist";
export declare class SkillLibraryCatalogError extends Error {
    code: "SKILL_LIBRARY_CONFLICT" | "SKILL_LIBRARY_NOT_FOUND" | "SKILL_LIBRARY_VALIDATION";
    constructor(code: SkillLibraryCatalogError["code"], message: string);
}
export declare class SkillLibraryCatalog {
    private index;
    private loaded;
    private mutationQueue;
    private readonly root;
    constructor(dataDir: string);
    private get indexPath();
    private libraryRoot;
    private packageRoot;
    private versionPath;
    private saveIndex;
    load(): Promise<void>;
    private assertLoaded;
    private mutate;
    list(): SkillLibrary[];
    get(libraryId: string): SkillLibrary | undefined;
    listProposals(libraryId?: string): SkillLibraryUpdateProposal[];
    getProposal(proposalId: string): SkillLibraryUpdateProposal | undefined;
    create(input?: {
        id?: string;
        name?: string;
    }): Promise<SkillLibrary>;
    seedBuiltInSkillLibrary(repositoryRoot: string): Promise<SkillLibrary>;
    getVersion(libraryId: string, versionId: string): Promise<SkillLibraryVersion>;
    listVersions(libraryId: string): Promise<SkillLibraryVersion[]>;
    private persistPackage;
    private buildCommit;
    commitVersion(libraryId: string, request: CommitSkillLibraryVersionRequest): Promise<CommitSkillLibraryVersionResult>;
    proposeUpdate(libraryId: string, request: ProposeSkillLibraryUpdateRequest): Promise<SkillLibraryUpdateProposal>;
    rejectProposal(proposalId: string): Promise<SkillLibraryUpdateProposal>;
    publishProposal(proposalId: string): Promise<PublishSkillLibraryUpdateProposalResult>;
    publishProposals(proposalIds: readonly string[]): Promise<PublishSkillLibraryUpdateProposalsResult>;
    private publishVersion;
    diffVersions(libraryId: string, fromVersionId: string, toVersionId: string): Promise<SkillLibraryDiff>;
    resolveEnabledRefs(libraries: readonly EnabledSkillLibrary[] | undefined): Promise<PromptSkillLibraryRef[]>;
    search(request: SkillLibrarySearchRequest): Promise<SkillLibrarySearchResult>;
    resolveSkills(candidates: readonly SkillLibrarySearchCandidate[]): Promise<RuntimeSkillSnapshot[]>;
    validateRefs(refs: readonly PromptSkillLibraryRef[] | undefined): Promise<PromptSkillLibraryRef[]>;
    rollback(libraryId: string, request: RollbackSkillLibraryVersionRequest): Promise<CommitSkillLibraryVersionResult>;
    private readStoredPackage;
}
