import { type EnvironmentSourceSettings, type InstallEnvironmentRequest } from "@sciencediscovery/schema";
import type { RunnerInstallEnvironmentRequest } from "@sciencediscovery/executor";
export declare function normalizeEnvironmentSourceSettings(value: unknown, strict?: boolean): EnvironmentSourceSettings;
export declare function resolveEnvironmentInstallRequest(input: InstallEnvironmentRequest, settings: EnvironmentSourceSettings, workspaceRoot?: string): RunnerInstallEnvironmentRequest;
