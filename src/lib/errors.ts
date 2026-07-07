export class NotImplementedError extends Error {
  constructor(endpoint: string) {
    super(`API-Endpunkt noch nicht implementiert: ${endpoint}`);
    this.name = "NotImplementedError";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}