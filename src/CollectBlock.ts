import { Bot } from 'mineflayer'
import { Block } from 'prismarine-block'
import { Movements } from 'mineflayer-pathfinder'
import { Entity } from 'prismarine-entity'
import { Vec3 } from 'vec3'
import { emptyInventoryIfFull, ItemFilter } from './Inventory'
import { findFromVein } from './BlockVeins'
import { Collectable, Targets } from './targets/Targets'
import { Item } from 'prismarine-item'
import mcDataLoader from 'minecraft-data'
import { BlockTarget } from './targets/BlockTarget'
import { ItemDropTarget } from './targets/ItemDropTarget'
import { UnresolvedDependencyError } from './UnresolvedDependencyError'
import { UnknownCollectableError } from './UnknownCollectableError'

export type Callback = (err?: Error) => void

function collectAll (bot: Bot, options: CollectOptionsFull, cb: Callback): void {
  const collectNext = (): void => {
    if (!options.targets.empty) {
      emptyInventoryIfFull(bot, options.chestLocations, options.itemFilter, (err?: Error) => {
        if (err != null) {
          cb(err)
          return
        }

        const closest = options.targets.getClosest()

        if (closest == null) {
          cb()
          return
        }

        closest.collect()
          .then(collectNext)
          .catch(cb)
      })
    } else {
      cb()
    }
  }

  collectNext()
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
export interface CollectOptionsFull {
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
    this.targets = new Targets()
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

    const optionsFull: CollectOptionsFull = {
      append: options.append ?? false,
      ignoreNoPath: options.ignoreNoPath ?? false,
      chestLocations: options.chestLocations ?? this.chestLocations,
      itemFilter: options.itemFilter ?? this.itemFilter,
      targets: this.targets
    }

    // @ts-expect-error
    const pathfinder = this.bot.pathfinder
    if (pathfinder == null) {
      cb(new UnresolvedDependencyError('The mineflayer-collectblock plugin relies on the mineflayer-pathfinder plugin to run!'))
      return
    }

    // @ts-expect-error
    const tool = this.bot.tool
    if (tool == null) {
      cb(new UnresolvedDependencyError('The mineflayer-collectblock plugin relies on the mineflayer-tool plugin to run!'))
      return
    }

    if (this.movements != null) {
      pathfinder.setMovements(this.movements)
    }

    const beginCollect = (startNew: boolean): void => {
      if (!Array.isArray(target)) target = [target]
      for (const t of target) {
        if (t instanceof Block) this.targets.appendTarget(new BlockTarget(this.bot, t, optionsFull))
        else if (t instanceof Entity) this.targets.appendTarget(new ItemDropTarget(this.bot, t))
        else throw new UnknownCollectableError('Unknown collectable type!')
      }

      if (startNew) {
        collectAll(this.bot, optionsFull, (err) => {
          if (err != null) {
            // Clear the current task on error, since we can't be sure we cleaned up properly
            this.targets.clear()
          }

          // @ts-expect-error
          this.bot.emit('collectBlock_finished')

          cb(err)
        })
      }
    }

    if (!optionsFull.append) {
      this.cancelTask(() => {
        beginCollect(true)
      })
    } else {
      beginCollect(this.targets.empty)
    }
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
