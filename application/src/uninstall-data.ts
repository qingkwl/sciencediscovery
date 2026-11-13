import { posix } from "node:path";

/**
 * Uninstall & data-cleanup support (D4 §8 companion — "no uninstaller UI on
 * mac, but the deep-clean entry must exist somewhere other than an external
 * FAQ"): the help menu dialog lists these locations and offers a guarded
 * deep-clean action. Semantics are aligned with the NSIS uninstaller's
 * "also delete user data" checkbox — same deletion scope, mac-shaped entry.
 *
 * The data-dir location is wizard-persisted (wizard-state.ts), so the list is
 * computed at dialog time, not baked here.
 */

/** One on-disk data footprint the deep-clean removes (or opens for review). */
export interface DataFootprint {
  /** Stable key used in tests and logs. */
  id: string;
  /** Human label shown in the dialog (zh, product language). */
  label: string;
  /** Absolute path; null when the location is unknown (dev without wizard). */
  path: string | null;
}

/** Extra Library locations that exist regardless of the wizard's data dir. */
export function libraryFootprints(
  home: string,
  platform: "win32" | "darwin",
): DataFootprint[] {
  if (platform === "win32") {
    // win32: the NSIS uninstaller already owns cleanup (deep-delete
    // checkbox); the in-app entry is darwin-only — nothing to list.
    return [];
  }
  return [
    { id: "app-support", label: "应用设置（Electron userData）", path: posix.join(home, "Library", "Application Support", "sd-shell") },
    { id: "logs", label: "壳与服务日志", path: posix.join(home, "Library", "Logs", "sd-shell") },
    { id: "prefs", label: "偏好设置 plist", path: posix.join(home, "Library", "Preferences", "cn.sciencediscovery.desktop.plist") },
    { id: "saved-state", label: "窗口位置记忆", path: posix.join(home, "Library", "Saved Application State", "cn.sciencediscovery.desktop.savedState") },
  ];
}

/**
 * Full footprint list for the dialog: the wizard's data dir first (it holds
 * sessions/secrets/envs — the bulk), then the Library scatter.
 */
export function uninstallFootprints(
  dataDir: string | null,
  home: string,
  platform: "win32" | "darwin",
): DataFootprint[] {
  const main: DataFootprint[] = dataDir
    ? [{ id: "data-dir", label: "主数据目录（会话、密钥、运行环境）", path: dataDir }]
    : [];
  return [...main, ...libraryFootprints(home, platform)];
}

/** Flat path list of all footprints that have a known location. */
export function footprintPaths(footprints: DataFootprint[]): string[] {
  return footprints.flatMap(f => (f.path ? [f.path] : []));
}

