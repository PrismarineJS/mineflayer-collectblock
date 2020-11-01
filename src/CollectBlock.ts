import { Bot } from 'mineflayer'
import { Block } from 'prismarine-block'
import { Movements, goals, Result } from 'mineflayer-pathfinder'
import { TemporarySubscriber } from 'mineflayer-utils'
import { Entity } from 'prismarine-entity'
import { error } from './Util'
import { Vec3 } from 'vec3'
import { emptyInventoryIfFull, ItemFilter } from './Inventory'
import { findFromVein } from './BlockVeins'
import { Item } from 'prismarine-item'
import mcDataLoader from 'minecraft-data'

export type Callback = (err?: Error) => void
export type Collectable = Block | Entity

/**
 * Gets the closest position holder from a list.
 *
 * @param bot - The bot to get the position from.
 * @param targets - The list of position holders to sample from.
 */
function getClosest (bot: Bot, targets: Collectable[]): Collectable | null {
  let closest: Collectable | null = null
  let distance: number = 0

  for (const target of targets) {
    const dist = target.position.distanceTo(bot.entity.position)

    if (closest == null || dist < distance) {
      closest = target
      distance = dist
    }
  }

  return closest
}

function collectAll (bot: Bot, chestLocations: Vec3[], itemFilter: ItemFilter, targets: Collectable[], cb: Callback): void {
  const tempEvents = new TemporarySubscriber(bot)

  tempEvents.subscribeTo('entityGone', (entity: Entity) => {
    const index = targets.indexOf(entity)
    if (index >= 0) {
      targets.splice(index, 1)
    }
  })

  const collectNext = (err?: Error): void => {
    if (err != null) {
      tempEvents.cleanup()
      cb(err)
      return
    }

    if (targets.length > 0) {
      emptyInventoryIfFull(bot, chestLocations, itemFilter, (err?: Error) => {
        if (err != null) {
          tempEvents.cleanup()
          cb(err)
          return
        }

        const closest = getClosest(bot, targets)

        if (closest == null) {
          tempEvents.cleanup()
          cb()
          return
        }

        if (closest.constructor.name === 'Block') {
          collectBlock(bot, closest as Block, targets, collectNext)
        } else if (closest.constructor.name === 'Entity') {
          collectItem(bot, closest as Entity, collectNext)
        } else {
          cb(error('UnknownType', `Target ${closest.constructor.name} is not a Block or Entity!`))
        }
      })
    } else {
      cb()
    }
  }

  collectNext()
}

function collectBlock (bot: Bot, block: Block, targets: Collectable[], cb: Callback): void {
  // @ts-expect-error
  const pathfinder = bot.pathfinder

  const goal = new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z)
  pathfinder.setGoal(goal)

  const tempEvents = new TemporarySubscriber(bot)

  tempEvents.subscribeTo('goal_reached', () => {
    tempEvents.cleanup()
    mineBlock(bot, block, targets, cb)
  })

  tempEvents.subscribeTo('goal_updated', () => {
    tempEvents.cleanup()
    cb(error('PathfindingInterrupted', 'Pathfinding interrupted before block reached.'))
  })

  tempEvents.subscribeTo('path_update', (results: Result) => {
    if (results.status === 'noPath') {
      tempEvents.cleanup()
      cb(error('NoPath', 'No path to target block!'))
    }
  })
}

function mineBlock (bot: Bot, block: Block, targets: Collectable[], cb: Callback): void {
  selectBestTool(bot, block, () => {
    // Do nothing if the block is already air
    // Sometimes happens if the block is broken before the bot reaches it
    if (block.type === 0) {
      cb()
      return
    }

    const tempEvents = new TemporarySubscriber(bot)

    tempEvents.subscribeTo('itemDrop', (entity: Entity) => {
      if (entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= 0.5) {
        targets.push(entity)
      }
    })

    bot.dig(block, (err?: Error) => {
      if (err != null) {
        tempEvents.cleanup()
        cb(err)
        return
      }

      const index = targets.indexOf(block)
      if (index >= 0) {
        targets.splice(index, 1)
      }

      let remainingTicks = 10
      tempEvents.subscribeTo('physicTick', () => {
        remainingTicks--

        if (remainingTicks <= 0) {
          tempEvents.cleanup()
          cb()
        }
      })
    })
  })
}

function selectBestTool (bot: Bot, block: Block, cb: () => void): void {
  const options = {
    requireHarvest: true,
    getFromChest: true,
    maxTools: 2
  }

  // @ts-expect-error
  const toolPlugin: Tool = bot.tool
  toolPlugin.equipForBlock(block, options, cb)
}

function collectItem (bot: Bot, targetEntity: Entity, cb: Callback): void {
  const goal = new goals.GoalFollow(targetEntity, 0)

  // @ts-expect-error
  const pathfinder = bot.pathfinder
  pathfinder.setGoal(goal, true)

  const tempEvents = new TemporarySubscriber(bot)

  tempEvents.subscribeTo('entityGone', (entity: Entity) => {
    if (entity === targetEntity) {
      tempEvents.cleanup()
      cb()
    }
  })

  tempEvents.subscribeTo('goal_updated', (newGoal: goals.Goal | null) => {
    if (newGoal === goal) return
    tempEvents.cleanup()
    cb(error('PathfindingInterrupted', 'Pathfinding interrupted before item could be reached.'))
  })
}

/**
 * A set of options to apply when collecting the given targets.
 */
export interface CollectOptions {
  /**
   * If true, the target(s) will be appended to the existing target list instead of
   * starting a new task. Defaults to false.
   */
  append?: boolean
}

/**
 * The collect block plugin.
 */
export class CollectBlock {
  /**
     * The bot.
     */
  private readonly bot: Bot

  /**
     * The movements configuration to be sent to the pathfinder plugin.
     */
  movements?: Movements

  /**
     * A list of chest locations which the bot is allowed to empty their inventory into
     * if it becomes full while the bot is collecting resources.
     */
  chestLocations: Vec3[] = []

  /**
     * When collecting items, this filter is used to determine what items should be placed
     * into a chest if the bot's inventory becomes full. By default, returns true for all
     * items except for tools, weapons, and armor.
     *
     * @param item - The item stack in the bot's inventory to check.
     *
     * @returns True if the item should be moved into the chest. False otherwise.
     */
  itemFilter: ItemFilter = (item: Item) => {
    if (item.name.includes('helmet')) return false
    if (item.name.includes('chestplate')) return false
    if (item.name.includes('leggings')) return false
    if (item.name.includes('boots')) return false
    if (item.name.includes('shield')) return false
    if (item.name.includes('sword')) return false
    if (item.name.includes('pickaxe')) return false
    if (item.name.includes('axe')) return false
    if (item.name.includes('shovel')) return false
    if (item.name.includes('hoe')) return false
    return true
  }

  /**
     * Creates a new instance of the create block plugin.
     *
     * @param bot - The bot this plugin is acting on.
     */
  constructor (bot: Bot) {
    this.bot = bot
    this.movements = new Movements(bot, mcDataLoader(bot.version))
  }

  /**
     * If target is a block:
     * Causes the bot to break and collect the target block.
     *
     * If target is an item drop:
     * Causes the bot to collect the item drop.
     *
     * If target is an array containing items or blocks, preforms the correct action for
     * all targets in that array sorting dynamically by distance.
     *
     * @param target - The block(s) or item(s) to collect.
     * @param options - The set of options to use when handling these targets
     * @param cb - The callback that is called finished.
     */
  collect (target: Collectable | Collectable[], options: CollectOptions | Callback = {}, cb: Callback = () => {}): void {
    if (typeof options === 'function') {
      cb = options
      options = {}
    }

    let targetArray
    if (Array.isArray(target)) targetArray = target
    else targetArray = [target]

    // @ts-expect-error
    const pathfinder = this.bot.pathfinder
    if (pathfinder == null) {
      cb(error('UnresolvedDependency', 'The mineflayer-collectblock plugin relies on the mineflayer-pathfinder plugin to run!'))
      return
    }

    // @ts-expect-error
    const tool = this.bot.tool
    if (tool == null) {
      cb(error('UnresolvedDependency', 'The mineflayer-collectblock plugin relies on the mineflayer-tool plugin to run!'))
      return
    }

    if (this.movements != null) {
      pathfinder.setMovements(this.movements)
    }

    collectAll(this.bot, this.chestLocations, this.itemFilter, targetArray, cb)
  }

  findFromVein (block: Block, maxBlocks = 100, maxDistance = 16, floodRadius = 1): Block[] {
    return findFromVein(this.bot, block, maxBlocks, maxDistance, floodRadius)
  }
}
