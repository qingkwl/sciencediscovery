/** A user-initiated diagnostic, never a startup gate or a settings mutation. */
export declare function testProxyConnectivity(input: unknown): Promise<{
    ok: boolean;
    target: string;
    status: number;
    elapsedMs: number;
    message: string;
} | {
    status?: undefined;
    ok: boolean;
    target: string;
    elapsedMs: number;
    message: string;
}>;
