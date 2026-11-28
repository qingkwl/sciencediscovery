import { type DiagnosticIds, type DiagnosticSnapshot } from "@sciencediscovery/operational-logging/diagnostics";
export declare function diagnosticIds(params: URLSearchParams): DiagnosticIds | undefined;
/** Export metadata, never arbitrary log text, prompts, tool I/O or error payloads. */
export declare function diagnosticLogLine(line: string, ids: DiagnosticIds): string | undefined;
export declare function errorDiagnosticSnapshot(logPaths: string[], ids: DiagnosticIds): Promise<DiagnosticSnapshot>;
export declare function diagnosticLogPaths(dataDir: string, apiPath: string, runPath: string): string[];
