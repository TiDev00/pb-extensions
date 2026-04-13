import { Request } from "@paperback/types";

export interface PaginationMetadata {
  page?: number;
}

const DEFAULT_REQUESTS_PER_SECOND = 4;
const DEFAULT_REQUEST_TIMEOUT = 20_000;
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1";
const CLOUDFLARE_BYPASS_MESSAGE =
  'CLOUDFLARE BYPASS ERROR:\nGo to Source settings and tap "Cloudflare Bypass".';

export function createSourceRequestManager(
  baseUrl: string,
  extraHeaders: Record<string, string> = {},
) {
  return App.createRequestManager({
    requestsPerSecond: DEFAULT_REQUESTS_PER_SECOND,
    requestTimeout: DEFAULT_REQUEST_TIMEOUT,
    interceptor: {
      interceptRequest: async (request: Request): Promise<Request> => ({
        ...request,
        headers: {
          ...(request.headers ?? {}),
          "user-agent": MOBILE_USER_AGENT,
          referer: baseUrl,
          ...extraHeaders,
        },
      }),
      interceptResponse: async (response) => response,
    },
  });
}

export function createGetRequest(url: string): Request {
  return App.createRequest({ url, method: "GET" });
}

export function createCloudflareBypassRequest(baseUrl: string): Request {
  return createGetRequest(baseUrl);
}

export function throwIfCloudflareBlocked(status: number): void {
  if (status === 403 || status === 503) {
    throw new Error(CLOUDFLARE_BYPASS_MESSAGE);
  }
}

export function getPageNumber(metadata: unknown): number {
  return (metadata as PaginationMetadata | undefined)?.page ?? 1;
}
