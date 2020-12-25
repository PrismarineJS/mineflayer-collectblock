export class PathfindingInterruptedError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'PathfindingInterrupted'
  }
}
