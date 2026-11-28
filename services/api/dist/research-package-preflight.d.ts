export declare const RESEARCH_PACKAGE_DISK_CODE = "RESEARCH_PACKAGE_INSUFFICIENT_DISK";
export declare const RESEARCH_PACKAGE_MEMORY_CODE = "RESEARCH_PACKAGE_INSUFFICIENT_MEMORY";
/** What the machine has for one package operation. */
export type PackageCapacity = {
    freeDiskBytes: number;
    freeMemoryBytes: number;
};
/**
 * What an export writes: one compressed archive.
 *
 * The uncompressed size bounds it from above (gzip never makes incompressible data
 * usefully larger than its input, and the cap already allows that slack), so charging
 * three copies here — as a restore needs — refused exports that only ever write one
 * file (#1200 review 3).
 */
export declare function researchPackageExportRequirement(bytes: number): {
    diskBytes: number;
    memoryBytes: number;
};
/**
 * What the synchronous export writes: the HTTP response, and no disk at all.
 *
 * That route streams tar -> gzip straight into `ServerResponse`, and the volume
 * the bytes land on is the client's, not `store.dataDir`'s. Charging an archive
 * here refused exports that need no space on this machine — a 4 GiB package on a
 * volume with 3 GiB free is exactly the multi-GiB case the streaming path exists
 * for (#1216 review 1). Only the memory headroom applies: the writer still holds
 * one object at a time.
 */
export declare function researchPackageResponseExportRequirement(bytes: number): {
    diskBytes: number;
    memoryBytes: number;
};
/** What an upload needs before anything is parsed: the staged compressed file. */
export declare function researchPackageUploadRequirement(bytes: number): {
    diskBytes: number;
    memoryBytes: number;
};
/**
 * Refuse a package operation before it starts instead of failing halfway.
 *
 * The message is user-facing: an export that dies at 80% leaves a truncated file and a
 * dialog that only says the export failed, while this says what was missing.
 */
export declare function assertResearchPackageExportCapacity(capacity: PackageCapacity, archiveBytes: number): void;
/** The response route writes no disk, so only its memory headroom is charged. */
export declare function assertResearchPackageResponseExportCapacity(capacity: PackageCapacity, archiveBytes: number): void;
/** The upload is the first bound a client meets; it only stages the compressed file. */
export declare function assertResearchPackageUploadCapacity(capacity: PackageCapacity, uploadBytes: number): void;
/** Measure the machine's capacity for a package operation on `dataDir`'s volume. */
export declare function measureResearchPackageCapacity(dataDir: string): Promise<PackageCapacity>;
/** What a restore needs, known only after the archive has been parsed. */
export type PackageRestoreSize = {
    unpackedBytes: number;
    largestObjectBytes: number;
    recordsBytes: number;
};
/**
 * What a restore still has to write, from the moment it is checked.
 *
 * The unpacked objects are already on disk — the streamed import wrote them — and the
 * restore adds three more copies: the snapshot's object directory, one CAS blob per
 * object, and the workspace files (plus a version blob per version object, which for the
 * normal shape equals the object bytes). Two was one short once the workspace write is
 * counted (#1211 F5). It reads one object at a time, so its memory is the largest single
 * object.
 */
export declare function researchPackageRestoreRequirement(size: PackageRestoreSize): {
    diskBytes: number;
    memoryBytes: number;
};
/** The same refusals as `assertResearchPackageCapacity`, measured on what the restore will do. */
export declare function assertResearchPackageRestoreCapacity(capacity: PackageCapacity, size: PackageRestoreSize): void;
/**
 * The unpacked budget the free disk can hold, given the copies the route still writes.
 *
 * `copies` counts what the route writes *after* the parse has already put the unpacked
 * tree on disk, so the divisor is `copies + 1`. A restore writes three more — the
 * snapshot's object directory, one CAS blob per object and the workspace files, which
 * `researchPackageRestoreRequirement` charges as `unpacked * 3` — so its default is
 * `free / 4`. Dividing by three admitted a tree of up to `free / 3`, expanded it, and
 * then failed the post-parse check that needs `3 x unpacked`; the refusal has to come
 * before the write, which is why the divisor follows the requirement (#1216 review 3).
 *
 * An inspect unpacks one copy and writes one more while it reads it, so it passes
 * `copies: 1` and gets `free / 2`; sharing the restore's divisor refused an inspect
 * whose objects fit.
 *
 * The bound has to reach the parser itself: checking only after the unpacking finishes
 * would let a highly compressible archive fill the disk before the check runs.
 */
export declare function researchPackageUnpackBudget(capacity: PackageCapacity, ceiling: number, copies?: number): number;
/** Derive the restore's size from a parsed package's inventory. */
export declare function restoreSizeOf(inventory: ReadonlyArray<{
    kind: string;
    sizeBytes: number;
}>, recordsBytes: number): PackageRestoreSize;
/** The disk refusal both the checks and the streamed parse's budget answer with. */
export declare function researchPackageDiskMessage(needBytes: number, freeBytes: number, options?: {
    atLeast?: boolean;
}): string;
/**
 * The refusal for a parse that stopped at the free-disk budget.
 *
 * The parser knows only how much unpacked data it had summed when it stopped, and the
 * caller measures free space before it removes the staged upload; the whole import needs
 * three copies of that unpacked total (upload, snapshot, CAS), so quoting three times a
 * lower bound always exceeds the free figure that triggered the budget — the message
 * cannot contradict itself (#1200 review 5).
 */
export declare function researchPackageBudgetRefusal(unpackedBytes: number, freeBytes: number): {
    needBytes: number;
    message: string;
};
