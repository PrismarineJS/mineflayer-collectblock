import { CollectTarget } from './Targets'
import { Bot } from 'mineflayer'
import { Entity } from 'prismarine-entity'
import { goals } from 'mineflayer-pathfinder'
import { PathfindingInterruptedError } from '../errors/PathfindingInterupptedError'

export class ItemDropTarget extends CollectTarget {
  private readonly bot: Bot
  private readonly entity: Entity

  constructor (bot: Bot, entity: Entity) {
    super()
    this.bot = bot
    this.entity = entity
  }

  distance (): number {
    return this.entity.position.distanceTo(this.bot.entity.position)
  }

  async collect (): Promise<void> {
    // Do nothing if entity is no longer there.
    if (!this.entity.isValid) return

    // @ts-expect-error ; Pathfinder is a plugin
    const pathfinder: Pathfinder = this.bot.pathfinder

    const goal = new goals.GoalFollow(this.entity, 0)
    pathfinder.setGoal(goal, true)

    await new Promise<void>((resolve, reject) => {
      let entityGoneListener: (entity: Entity) => void = () => {}
      let goalUpdatedListener: (newGoal: goals.Goal | null) => void = () => {}

      entityGoneListener = (entity: Entity): void => {
        if (entity !== this.entity) return

        // @ts-expect-error ; goal_updated is a pathfinder event
        this.bot.off('goal_updated', goalUpdatedListener)
        this.bot.off('entityGone', entityGoneListener)

        resolve()
      }

      goalUpdatedListener = (newGoal: goals.Goal | null): void => {
        if (newGoal === goal) return

        // @ts-expect-error ; goal_updated is a pathfinder event
        this.bot.off('goal_updated', goalUpdatedListener)
        this.bot.off('entityGone', entityGoneListener)

        reject(new PathfindingInterruptedError('Pathfinding interrupted before item could be reached.'))
      }

      // @ts-expect-error ; goal_updated is a pathfinder event
      this.bot.on('goal_updated', goalUpdatedListener)
      this.bot.on('entityGone', entityGoneListener)
    })
  }
}
