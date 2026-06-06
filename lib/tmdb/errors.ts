export type TmdbErrorCode =
  | "TMDB_AUTH_ERROR"
  | "TMDB_NETWORK_ERROR"
  | "TMDB_NOT_CONFIGURED"
  | "TMDB_NOT_FOUND"
  | "TMDB_RATE_LIMITED"
  | "TMDB_UPSTREAM_ERROR";

type TmdbClientErrorOptions = {
  code: TmdbErrorCode;
  message: string;
  retryAfter?: string;
  status: number;
  upstreamStatus?: number;
};

export class TmdbClientError extends Error {
  readonly code: TmdbErrorCode;
  readonly retryAfter?: string;
  readonly status: number;
  readonly upstreamStatus?: number;

  constructor({ code, message, retryAfter, status, upstreamStatus }: TmdbClientErrorOptions) {
    super(message);
    this.name = "TmdbClientError";
    this.code = code;
    this.retryAfter = retryAfter;
    this.status = status;
    this.upstreamStatus = upstreamStatus;
  }
}

export function isTmdbClientError(error: unknown): error is TmdbClientError {
  return error instanceof TmdbClientError;
}
