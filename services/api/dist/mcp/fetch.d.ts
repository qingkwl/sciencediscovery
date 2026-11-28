import type { ResolvedProxy } from "@sciencediscovery/schema";
/** 将运行时 Request 转成 undici 可接收的参数，保留流式请求体与取消信号。 */
export declare function fetchMcpRequest(request: Request, proxy?: ResolvedProxy): Promise<Response>;
