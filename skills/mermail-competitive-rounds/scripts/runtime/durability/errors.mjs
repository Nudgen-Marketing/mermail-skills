export class R6Error extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "R6Error";
    this.code = code;
    this.details = details;
  }
}
export function fail(code, message, details = {}) {
  throw new R6Error(code, message, details);
}

export function errorCode(error) {
  return error?.code ?? error?.name ?? "ERROR";
}
