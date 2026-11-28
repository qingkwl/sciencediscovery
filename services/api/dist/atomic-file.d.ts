export type Rename = (from: string, to: string) => Promise<void>;
/** Test seams: a real rename, and a real timer, unless a test says otherwise. */
export interface ReplaceFileOptions {
    rename?: Rename;
    sleep?: (milliseconds: number) => Promise<unknown>;
}
/** Replace `to` with `from`, retrying a rename that Windows refused transiently. */
export declare function replaceFile(from: string, to: string, options?: ReplaceFileOptions): Promise<void>;
