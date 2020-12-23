import { Block } from 'prismarine-block'
import { Entity } from 'prismarine-entity'

export type Collectable = Block | Entity

export abstract class CollectTarget {
  abstract distance (): number
  abstract collect (): Promise<void>
}

export class Targets {
  private readonly targets: CollectTarget[] = []

  appendTargets (targets: CollectTarget[]): void {
    for (const target of targets) {
      this.appendTarget(target)
    }
  }

  appendTarget (target: CollectTarget): void {
    if (this.targets.includes(target)) return
    this.targets.push(target)
  }

  /**
   * Gets the closest target to the bot in this list.
   *
   * @returns The closest target, or null if there are no targets.
   */
  getClosest (): CollectTarget | null {
    let closest: CollectTarget | null = null
    let distance: number = 0

    for (const target of this.targets) {
      const dist = target.distance()

      if (closest == null || dist < distance) {
        closest = target
        distance = dist
      }
    }

    return closest
  }

  get empty (): boolean {
    return this.targets.length === 0
  }

  clear (): void {
    this.targets.length = 0
  }

  removeTarget (target: CollectTarget): void {
    const index = this.targets.indexOf(target)
    if (index < 0) return
    this.targets.splice(index, 1)
  }
}
