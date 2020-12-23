export class UnknownCollectableError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'UnknownCollectable'
  }
}
