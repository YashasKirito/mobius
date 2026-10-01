export type StreamErrorCode =
  | "stream_unconfigured"
  | "no_sources"
  | "search_failed"
  | "torrent_timeout"
  | "invalid_request";

export class StreamError extends Error {
  status: number;
  code: StreamErrorCode;

  constructor(status: number, code: StreamErrorCode, message?: string) {
    super(message ?? code);
    this.name = "StreamError";
    this.status = status;
    this.code = code;
  }
}
