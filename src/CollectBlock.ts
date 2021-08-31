import { Bot } from 'mineflayer'
import { Block } from 'prismarine-block'
import { Movements, goals } from 'mineflayer-pathfinder'
import { TemporarySubscriber } from './TemporarySubscriber'
import { Entity } from 'prismarine-entity'
import { error } from './Util'
import { Vec3 } from 'vec3'
import { emptyInventoryIfFull, ItemFilter } from './Inventory'
import { findFromVein } from './BlockVeins'
import { Collectable, Targets } from './Targets'
import { Item } from 'prismarine-item'
import mcDataLoader from 'minecraft-data'

export type Callback = (err?: Error) => void

async function collectAll (bot: Bot, options: CollectOptionsFull, cb?: Callback): Promise<void> {
  const tempEvents = new TemporarySubscriber(bot)

  tempEvents.subscribeTo('entityGone', (entity: Entity) => {
    options.targets.removeTarget(entity)
  })

  const collectNext = async (err?: Error): Promise<void> => {
    if (err != null) {
      tempEvents.cleanup()
      if ((cb != null) && typeof cb === 'function') cb(err)
      throw err
    }

    if (!options.targets.empty) {
      try {
        await emptyInventoryIfFull(bot, options.chestLocations, options.itemFilter)

        const closest = options.targets.getClosest()

        if (closest == null) {
          tempEvents.cleanup()
          if ((cb != null) && typeof cb === 'function') cb()
          return
        }

        if (closest.constructor.name === 'Block') {
          await new Promise((resolve) => setTimeout(resolve))
          await collectBlock(bot, closest as Block, options)
          await collectNext()
        } else if (closest.constructor.name === 'Entity') {
          await new Promise((resolve) => setTimeout(resolve))
          await collectItem(bot, closest as Entity, options)
          await collectNext()
        } else {
          const err = error('UnknownType', `Target ${closest.constructor.name} is not a Block or Entity!`)
          if ((cb != null) && typeof cb === 'function') cb(err)
          throw err
        }
      } catch (err: any) {
        tempEvents.cleanup()
        if ((cb != null) && typeof cb === 'function') cb(err)
        throw err
      }
    } else {
      tempEvents.cleanup()
      if ((cb != null) && typeof cb === 'function') cb()
    }
  }

  try {
    await collectNext()
  } catch (err: any) {
    if ((cb != null) && typeof cb === 'function') cb(err)
    throw err
  }
}

async function collectBlock (bot: Bot, block: Block, options: CollectOptionsFull, cb?: Callback): Promise<void> {
  const pathfinder = bot.pathfinder

  const tempEvents = new TemporarySubscriber(bot)

  await new Promise<void>(async (resolve, reject) => {
    try {
      const goal = new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z)
      await pathfinder.goto(goal)
      await mineBlock(bot, block, options)
      resolve()
    } catch (err) {
      tempEvents.cleanup()
      // const err = error('PathfindingInterrupted', 'Pathfinding interrupted before block reached.') ???
      // cb(error('NoPath', 'No path to target block!')) ???
      reject(err)
    }
  })
}

async function mineBlock (bot: Bot, block: Block, options: CollectOptionsFull, cb?: Callback): Promise<void> {
  try {
    await selectBestTool(bot, block)
  } catch (err: any) {
    if ((cb != null) && typeof cb === 'function') cb(err)
    throw err
  }

  await new Promise<void>((resolve, reject) => {
    // Do nothing if the block is already air
    // Sometimes happens if the block is broken before the bot reaches it
    if (block.type === 0) {
      if ((cb != null) && typeof cb === 'function') cb()
      resolve()
      return
    }

    const tempEvents = new TemporarySubscriber(bot)

    tempEvents.subscribeTo('itemDrop', (entity: Entity) => {
      if (entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= 0.5) {
        options.targets.appendTarget(entity)
      }
    })

    bot.dig(block).then(() => {
      let remainingTicks = 10
      tempEvents.subscribeTo('physicTick', () => {
        remainingTicks--

        if (remainingTicks <= 0) {
          options.targets.removeTarget(block)
          tempEvents.cleanup()
          if ((cb != null) && typeof cb === 'function') cb()
          resolve()
        }
      })
    }).catch(err => {
      tempEvents.cleanup()
      if ((cb != null) && typeof cb === 'function') cb(err)
      reject(err)
    })
  })
}

async function selectBestTool (bot: Bot, block: Block, cb?: () => void): Promise<void> {
  const options = {
    requireHarvest: true,
    getFromChest: true,
    maxTools: 2
  }

  // @ts-expect-error
  const toolPlugin: Tool = bot.tool
  try {
    await toolPlugin.equipForBlock(block, options)
    if ((cb != null) && typeof cb === 'function') cb()
  } catch (err) {
    if ((cb != null) && typeof cb === 'function') cb()
    throw err
  }
}

async function collectItem (bot: Bot, targetEntity: Entity, options: CollectOptionsFull, cb?: Callback): Promise<void> {
  // Don't collect any entities that are marked as 'invalid'
  if (!targetEntity.isValid) {
    if ((cb != null) && typeof cb === 'function') cb()
    return
  }
  return await new Promise((resolve, reject) => {
    // Cannot promisify setGoal to goto as goto does not support dynamic targets used for
    // changing targets like goalFollow.
    const goal = new goals.GoalFollow(targetEntity, 0)

    const pathfinder = bot.pathfinder
    pathfinder.setGoal(goal, true)

    const tempEvents = new TemporarySubscriber(bot)

    tempEvents.subscribeTo('entityGone', (entity: Entity) => {
      if (entity === targetEntity) {
        tempEvents.cleanup()
        if ((cb != null) && typeof cb === 'function') cb()
        resolve()
      }
    })

    tempEvents.subscribeTo('goal_updated', (newGoal: goals.Goal | null) => {
      if (newGoal === goal) return
      tempEvents.cleanup()
      const err = error('PathfindingInterrupted', 'Pathfinding interrupted before item could be reached.')
      if ((cb != null) && typeof cb === 'function') cb(err)
      reject(err)
    })
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

  /**
   * If true, errors will not be thrown when a path to the target block cannot
   * be found. The bot will attempt to choose the best available position it
   * can find, instead. Errors are still thrown if the bot cannot interact with
   * the block from it's final location. Defaults to false.
   */
  ignoreNoPath?: boolean

  /**
   * Gets the list of chest locations to use when storing items after the bot's
   * inventory becomes full. If undefined, it defaults to the chest location
   * list on the bot.collectBlock plugin.
   */
  chestLocations?: Vec3[]

  /**
   * When transferring items to a chest, this filter is used to determine what
   * items are allowed to be moved, and what items aren't allowed to be moved.
   * Defaults to the item filter specified on the bot.collectBlock plugin.
   */
  itemFilter?: ItemFilter
}

/**
 * A version of collect options where all values are assigned.
 */
interface CollectOptionsFull {
  append: boolean
  ignoreNoPath: boolean
  chestLocations: Vec3[]
  itemFilter: ItemFilter
  targets: Targets
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
   * The list of active targets being collected.
   */
  private readonly targets: Targets

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
    this.targets = new Targets(bot)
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
     * @param options - Optional. The set of options to use when handling these targets
     * @param cb - Optional and Deprecated. The callback that is called when finished.
     */
  async collect (target: Collectable | Collectable[], options: CollectOptions | Callback = {}, cb?: Callback): Promise<void> {
    if (typeof options === 'function') {
      cb = options
      options = {}
    }

    const optionsFull: CollectOptionsFull = {
      append: options.append ?? false,
      ignoreNoPath: options.ignoreNoPath ?? false,
      chestLocations: options.chestLocations ?? this.chestLocations,
      itemFilter: options.itemFilter ?? this.itemFilter,
      targets: this.targets
    }

    const pathfinder = this.bot.pathfinder
    if (pathfinder == null) {
      const err = error('UnresolvedDependency', 'The mineflayer-collectblock plugin relies on the mineflayer-pathfinder plugin to run!')
      if (cb != null) cb(err)
      throw err
    }

    // @ts-expect-error
    const tool = this.bot.tool
    if (tool == null) {
      const err = error('UnresolvedDependency', 'The mineflayer-collectblock plugin relies on the mineflayer-tool plugin to run!')
      if (cb != null) cb(err)
      throw err
    }

    if (this.movements != null) {
      pathfinder.setMovements(this.movements)
    }

    const beginCollect = async (startNew: boolean): Promise<void> => {
      if (Array.isArray(target)) this.targets.appendTargets(target)
      else this.targets.appendTarget(target)

      if (startNew) {
        try {
          await collectAll(this.bot, optionsFull)
          this.targets.clear()
          // @ts-expect-error
          this.bot.emit('collectBlock_finished')
        } catch (err: any) {
          if (cb != null) cb(err)
          throw err
        }
      }
    }

    return await new Promise(async (resolve, reject) => {
      if (!optionsFull.append) {
        this.cancelTask(async () => {
          try {
            await beginCollect(true)
          } catch (err) {
            reject(err)
          }
        })
      } else {
        try {
          await beginCollect(this.targets.empty)
        } catch (err) {
          reject(err)
          return
        }
      }
      resolve()
    })
  }

  /**
   * Loads all touching blocks of the same type to the given block and returns them as an array.
   * This effectively acts as a flood fill algorithm to retrieve blocks in the same ore vein and similar.
   *
   * @param block - The starting block.
   * @param maxBlocks - The maximum number of blocks to look for before stopping.
   * @param maxDistance - The max distance from the starting block to look.
   * @param floodRadius - The max distance distance from block A to block B to be considered "touching"
   */
  findFromVein (block: Block, maxBlocks = 100, maxDistance = 16, floodRadius = 1): Block[] {
    return findFromVein(this.bot, block, maxBlocks, maxDistance, floodRadius)
  }

  /**
   * Cancels the current collection task, if still active.
   *
   * @param cb - The callback to use when the task is stopped.
   */
  cancelTask (cb: Callback = () => {}): void {
    if (this.targets.empty) {
      cb()
    } else {
      // @ts-expect-error
      this.bot.once('collectBlock_finished', cb)
    }
  }
}
