export class ArenaRepositoryError extends Error {
  readonly name = "ArenaRepositoryError";

  constructor(readonly code: string, message: string) {
    super(message);
  }
}
