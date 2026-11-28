import type { SshConfigHostImport } from "@sciencediscovery/schema";
/**
 * Read one `Host` block out of the user's SSH configuration so a machine they
 * already use can be registered without retyping it.
 *
 * The product no longer connects through that configuration — it speaks SSH
 * itself with its own credentials — so this is strictly a convenience: the
 * values are copied into the machine record, and from then on the product's
 * copy is what is used.
 */
export declare function readSshConfigHost(configPath: string, aliasValue: string): Promise<SshConfigHostImport>;
/**
 * Every `Host` entry the user could import, so the settings page can offer a
 * list instead of asking them to recall a name. Pattern blocks such as `Host *`
 * are left out because they describe no particular machine, and no key material
 * is read here — only where each entry points.
 */
export declare function listSshConfigHosts(configPath: string): Promise<SshConfigHostImport[]>;
/**
 * Where a freshly generated key waits between "generate" and "register".
 *
 * The pair is made before the machine record exists, so the material has to live
 * somewhere the next call can name. It is written owner-only inside the product
 * data directory and deleted as soon as it has been stored encrypted, so the
 * loose copy is short-lived and the browser only ever sees the path.
 */
export declare function generatedKeyDirectory(dataDir: string): string;
export declare function stageGeneratedKey(dataDir: string, privateKey: string): Promise<string>;
/** Remove a staged key once it is stored encrypted; other paths are left alone. */
export declare function consumeStagedKey(dataDir: string, path: string): Promise<void>;
/**
 * The key material at `path`, when this process can read it. A key the user's
 * agent holds but this process cannot open is reported as unreadable, so the
 * settings page can offer a password or a generated key instead of failing at
 * connect time.
 */
export declare function readablePrivateKey(path: string): Promise<string | undefined>;
