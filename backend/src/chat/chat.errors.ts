export class ChatStreamError extends Error {
  public readonly code: string;
  public readonly cause?: Error;

  constructor(code: string, message: string, options?: { cause?: Error }) {
    super(message);
    this.code = code;
    this.name = 'ChatStreamError';
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}
