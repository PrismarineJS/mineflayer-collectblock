export class NoChestsError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'NoChests'
  }
}
