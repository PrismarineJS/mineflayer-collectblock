export class UnresolvedDependencyError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'UnresolvedDependency'
  }
}
