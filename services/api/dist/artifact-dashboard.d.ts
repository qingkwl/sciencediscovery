import type { Project, ScientificArtifact, ScientificArtifactKind, ScientificArtifactVersion, Session } from "@sciencediscovery/schema";
import type { ProvenanceRecorder } from "@sciencediscovery/provenance";
import type { SessionStore } from "./store.js";
/** Marker error codes the API catches and maps to specific HTTP statuses. */
export declare class ArtifactDashboardError extends Error {
    readonly code: "ARTIFACT_NOT_FOUND" | "ARTIFACT_CONTENT_UNAVAILABLE";
    constructor(code: "ARTIFACT_NOT_FOUND" | "ARTIFACT_CONTENT_UNAVAILABLE", message: string);
}
export interface ArtifactDashboardContext {
    projectId: string;
    projectName: string;
    sessionId: string;
    sessionTitle: string;
    /**
     * 0.1.0 placeholder — Project/Session do not yet carry label fields. This is
     * always `[]`; once project and Session labels are implemented, the server
     * can fill the array without a schema break for callers.
     */
    labels: string[];
}
export interface ArtifactDashboardEntry {
    artifact: ScientificArtifact;
    kind: ScientificArtifactKind;
    versions: ScientificArtifactVersion[];
    latestVersionId: string | undefined;
    hasParents: boolean;
}
export interface ArtifactDashboard {
    context: ArtifactDashboardContext;
    artifacts: ArtifactDashboardEntry[];
}
export declare function buildArtifactDashboard(store: SessionStore, sessionId: string, project: Project | undefined, session: Session): Promise<ArtifactDashboard>;
export type NotebookCellType = "code" | "markdown" | "raw";
export interface NotebookCell {
    cell_type: NotebookCellType;
    source: string;
    execution_count?: number | null;
}
/** A JSON document rendered as text, with the char budget already applied. */
export interface ArtifactJsonSource {
    source: string;
    totalChars: number;
    truncated: boolean;
}
export type ArtifactPreviewPayload = {
    version: ScientificArtifactVersion;
    kind: "figure";
    mode: "figure-url";
    contentUrl: string;
    size: number;
    truncated: false;
    note?: string;
} | {
    version: ScientificArtifactVersion;
    kind: "markdown";
    mode: "markdown-source";
    source: string;
    totalChars: number;
    truncated: boolean;
} | {
    /** `"json"` when a JSON document turned out to be a record array. */
    version: ScientificArtifactVersion;
    kind: "dataset" | "json";
    mode: "dataset-table";
    mediaSubtype: "csv" | "tsv" | "json";
    columns: string[];
    rows: string[][];
    totalRows: number;
    truncated: boolean;
    /**
     * How many cells of the returned rows were left out of the preview
     * because the grid's width is capped (see MAX_PREVIEW_COLUMNS). Zero for
     * a table that came back whole; the count is a user-visible loss, so the
     * viewer can say it instead of showing a silently shorter row.
     */
    clippedCells: number;
    /**
     * The header's column count and how many named columns the preview shows.
     * They differ when the header itself is wider than MAX_PREVIEW_COLUMNS; a
     * data line past the header is a wide row, so the cells it loses are
     * reported through clippedCells instead of widening this count.
     */
    clippedColumns: {
        total: number;
        shown: number;
    };
    /**
     * The re-indented source document, carried only for JSON-backed tables so
     * the viewer can offer a raw-JSON view of the same version. Absent for
     * csv/tsv, which have no JSON form to switch to.
     */
    rawJson?: ArtifactJsonSource;
} | {
    /**
     * A JSON document that does not map to a table: `source` is the
     * re-indented document, or the raw text when it does not parse
     * (`parsed: false`).
     */
    version: ScientificArtifactVersion;
    kind: "json";
    mode: "json-source";
    source: string;
    totalChars: number;
    truncated: boolean;
    parsed: boolean;
} | {
    version: ScientificArtifactVersion;
    kind: "structure";
    mode: "structure-source";
    source: string;
    atomCount: number;
    totalChars: number;
    truncated: boolean;
} | {
    version: ScientificArtifactVersion;
    kind: "report";
    mode: "report-iframe";
    contentUrl: string;
    size: number;
    truncated: boolean;
    note?: string;
} | {
    version: ScientificArtifactVersion;
    kind: "html";
    mode: "html-iframe";
    contentUrl: string;
    size: number;
    truncated: boolean;
    note?: string;
} | {
    version: ScientificArtifactVersion;
    kind: "notebook";
    mode: "notebook-cells";
    cells: NotebookCell[];
    totalCells: number;
    truncated: boolean;
    editable: false;
} | {
    version: ScientificArtifactVersion;
    kind: "latex";
    mode: "latex-source";
    source: string;
    totalChars: number;
    truncated: boolean;
} | {
    version: ScientificArtifactVersion;
    kind: ScientificArtifactKind;
    mode: "binary-fallback";
    contentUrl: string;
    size: number;
    note?: string;
};
/**
 * JSON.parse rounds every integer beyond 2^53 to the nearest double, so a
 * document that stores a 64-bit identifier would preview with different digits
 * than it holds. Keep the stored literal: a linear scan rewrites exactly those
 * integer tokens to placeholders before parsing, and the renderers put the
 * digits back. Strings are copied verbatim, so a row that merely looks like a
 * big number is left alone.
 *
 * Each placeholder is minted for one document: a random uuid makes it
 * unforgeable by text a user wrote, a counter keeps the placeholders inside one
 * document distinct, and the surrounding U+0001/U+0002 controls cannot appear
 * in a JSON string without an escape. The closing control also keeps one
 * placeholder from being a prefix of another once the counter reaches 10.
 */
export declare function createBigIntegerMarker(): string;
export declare function buildArtifactVersionPreview(store: SessionStore, recorder: ProvenanceRecorder, sessionId: string, versionId: string, maxRowsParam?: string, maxCharsParam?: string, maxCellsParam?: string): Promise<ArtifactPreviewPayload>;
