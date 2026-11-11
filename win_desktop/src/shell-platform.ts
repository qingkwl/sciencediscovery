// Shell-side platform decisions (macOS adaptation, D2 §1). Mirrors the
// backend's scripts/lib/stack-platform.mjs layering convention: platform
// checks live ONLY here and at the thin IO call sites that consume these
// pure functions — the rest of main.ts stays platform-agnostic.
//
// Everything here is pure so the darwin branches get full fixture coverage
// on any machine (same philosophy as the Windows F12 tag rule: inject, don't skip).

/** Node platform string, narrowed to the shells we actually ship. */
export type ShellPlatform = "win32" | "darwin";

export function shellPlatform(platform: NodeJS.Platform): ShellPlatform | null {
  if (platform === "win32" || platform === "darwin") return platform;
  return null;
}

/** Host platform, resolved once at module load (main.ts consumes this). */
export const IS_DARWIN = shellPlatform(process.platform) === "darwin";

// --- shell.log location (D-mac-01) ---------------------------------------------

/**
 * Where shell.log lives. Dev runs stay on userData on both platforms.
 * Packaged builds differ:
 * - win32: <install>\logs — the same folder NSIS writes
 *   install-diagnostics.log into, so one folder answers "where are the logs".
 * - darwin: app.getPath("logs") = ~/Library/Logs/<productName>. A
 *   notarized .app bundle breaks its signature on any internal write, so
 *   the Windows-style <install> sidecar would be a hard defect, not a
 *   style choice. The "open logs" affordance follows the same function
 *   and is correct on both platforms for free.
 */
export function shellLogDirFor(
  platform: ShellPlatform,
  packaged: boolean,
  paths: { exe: string; userData: string; logs: string },
): string {
  if (!packaged) return joinPosix(paths.userData, "logs");
  if (platform === "darwin") return paths.logs;
  return joinWindows(dirnameWindows(paths.exe), "logs");
}

// --- tiny path joins with EXPLICIT separator choice ----------------------------
// node:path's join follows the HOST platform; these decision functions must
// return the same string for the same fixture on any test machine — so the
// separator is a decision, not an accident.

function joinPosix(a: string, b: string): string {
  return `${a.replace(/\/+$/, "")}/${b}`;
}

function joinWindows(a: string, b: string): string {
  return `${a.replace(/[\\/]+$/, "")}\\${b}`;
}

function dirnameWindows(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return idx <= 0 ? p.slice(0, 1) : p.slice(0, idx);
}

// --- tray -----------------------------------------------------------------------

/**
 * Whether the shell should create a tray icon. macOS has no system-tray
 * culture (top-level v1 decision): quitting and window management live in
 * the Dock + application menu, so `tray` stays null and the close
 * handler's `tray`-guarded hide branch naturally falls through on darwin.
 */
export function wantsTray(platform: ShellPlatform): boolean {
  return platform === "win32";
}

// --- window-all-closed -----------------------------------------------------------

/**
 * Whether closing the last window should quit the app.
 * - darwin: stay alive — the Dock icon remains, the backend stack keeps
 *   serving "close the page, the task keeps running" (same SD backend
 *   contract as the tray-resident Windows build; window-all-closed +
 *   activate recreate the window on demand).
 * - win32 with tray: stay resident in the tray (Windows convention).
 * - win32 without tray (defensive fallback when Tray construction
 *   failed): quitting is the only way to avoid an unreachable process.
 */
export function shouldQuitOnAllWindowsClosed(platform: ShellPlatform, hasTray: boolean): boolean {
  if (platform === "darwin") return false;
  return !hasTray;
}

// --- application menu ------------------------------------------------------------

/**
 * Whether the application menu bar should be installed (macOS role menu)
 * or removed entirely (win32: production users need none of it, quitting
 * stays on the tray).
 *
 * On darwin the menu bar is not cosmetic: without it Cmd+Q/Cmd+W have no
 * binding, copy/paste/undo die in every text field (the system menu owns
 * the key equivalents), and there is no "bring all to front".
 */
export function shouldInstallRoleMenu(platform: ShellPlatform): boolean {
  return platform === "darwin";
}

/** One entry of a role-menu template: a named role, or a separator. */
export type RoleMenuEntry = { role: string } | { separator: true };

export interface RoleMenuSpec {
  appMenu: { role: "appMenu"; submenu: RoleMenuEntry[] };
  editMenu: { role: "editMenu"; submenu: RoleMenuEntry[] };
  /** DEV-only (reload/devtools are developer affordances, same call as win32); null in packaged builds. */
  viewMenu: { role: "viewMenu"; submenu: RoleMenuEntry[] } | null;
  windowMenu: { role: "windowMenu"; submenu: RoleMenuEntry[] };
}

/**
 * The minimal darwin role-menu template: app (quit) / edit (clipboard) /
 * view (dev only) / window (minimize/zoom/front). Window management roles
 * give the "全部置于顶层" affordance that pairs with Dock-click activate.
 */
export function darwinRoleMenu(dev: boolean): RoleMenuSpec {
  return {
    appMenu: {
      role: "appMenu",
      submenu: [
        { role: "about" },
        { separator: true },
        { role: "hide" },
        { role: "hideOthers" },
        { separator: true },
        { role: "quit" },
      ],
    },
    editMenu: {
      role: "editMenu",
      submenu: [
        { role: "undo" }, { role: "redo" },
        { separator: true },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "delete" }, { role: "selectAll" },
      ],
    },
    viewMenu: dev
      ? {
          role: "viewMenu",
          submenu: [
            { role: "reload" },
            { role: "toggleDevTools" },
            { separator: true },
            { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
            { separator: true },
            { role: "togglefullscreen" },
          ],
        }
      : null,
    windowMenu: {
      role: "windowMenu",
      submenu: [
        { role: "minimize" }, { role: "zoom" },
        { separator: true },
        { role: "front" },
      ],
    },
  };
}
