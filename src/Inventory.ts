import { Bot } from 'mineflayer'
import { Callback } from './CollectBlock'
import { Vec3 } from 'vec3'
import { error } from './Util'
import { Item } from 'prismarine-item'
import { TemporarySubscriber } from './TemporarySubscriber'
import { TaskQueue } from './TaskQueue'
import { goals, ComputedPath } from 'mineflayer-pathfinder'

export type ItemFilter = (item: Item) => boolean

function getClosestChest (bot: Bot, chestLocations: Vec3[]): Vec3 | null {
  let chest = null
  let distance = 0

  for (const c of chestLocations) {
    const dist = c.distanceTo(bot.entity.position)
    if (chest == null || dist < distance) {
      chest = c
      distance = dist
    }
  }

  if (chest != null) {
    chestLocations.splice(chestLocations.indexOf(chest), 1)
  }

  return chest
}

export function emptyInventoryIfFull (bot: Bot, chestLocations: Vec3[], itemFilter: ItemFilter, cb: Callback): void {
  if (bot.inventory.emptySlotCount() > 0) {
    cb()
    return
  }

  emptyInventory(bot, chestLocations, itemFilter, cb)
}

export function emptyInventory (bot: Bot, chestLocations: Vec3[], itemFilter: ItemFilter, cb: Callback): void {
  if (chestLocations.length === 0) {
    cb(error('NoChests', 'There are no defined chest locations!'))
    return
  }

  // Shallow clone so we can safely remove chests from the list that are full.
  chestLocations = [...chestLocations]

  const tryNextChest = (): void => {
    const chest = getClosestChest(bot, chestLocations)

    if (chest == null) {
      cb(error('NoChests', 'All chests are full.'))
      return
    }

    tryEmptyInventory(bot, chest, itemFilter, (err: Error | undefined, hasRemaining: boolean): void => {
      if (err != null) {
        cb(err)
        return
      }

      if (!hasRemaining) {
        cb()
        return
      }

      tryNextChest()
    })
  }

  tryNextChest()
}

function tryEmptyInventory (bot: Bot, chestLocation: Vec3, itemFilter: ItemFilter, cb: (err: Error | undefined, hasRemaining: boolean) => void): void {
  gotoChest(bot, chestLocation, (err?: Error) => {
    if (err != null) {
      cb(err, true)
      return
    }

    placeItems(bot, chestLocation, itemFilter, cb)
  })
}

function gotoChest (bot: Bot, location: Vec3, cb: Callback): void {
  // @ts-expect-error
  const pathfinder = bot.pathfinder

  pathfinder.setGoal(new goals.GoalGetToBlock(location.x, location.y, location.z))

  const events = new TemporarySubscriber(bot)
  events.subscribeTo('goal_reached', () => {
    events.cleanup()
    cb()
  })

  events.subscribeTo('path_update', (results: ComputedPath) => {
    if (results.status === 'noPath') {
      events.cleanup()
      cb(error('NoPath', 'No path to target block!'))
    }
  })

  events.subscribeTo('goal_updated', () => {
    events.cleanup()
    cb(error('PathfindingInterrupted', 'Pathfinding interrupted before item could be reached.'))
  })
}

function placeItems (bot: Bot, chestPos: Vec3, itemFilter: ItemFilter, cb: (err: Error | undefined, hasRemaining: boolean) => void): void {
  const chestBlock = bot.blockAt(chestPos)
  if (chestBlock == null) {
    cb(error('UnloadedChunk', 'Chest is in an unloaded chunk!'), true)
    return
  }

  try {
    let itemsRemain = false
    bot.openChest(chestBlock).then(chest => {
        const tryDepositItem = (item: Item, cb2: Callback): void => {
        // @ts-expect-error ; A workaround for checking if the chest is already full
        if (chest.items().length >= chest.inventoryStart) {
          // Mark that we have items that didn't fit.
          itemsRemain = true

          cb2()
          return
        }

        chest.deposit(item.type, item.metadata, item.count).then(() => cb2()).catch(err => cb2(err))
      }

      const taskQueue = new TaskQueue()
      for (const item of bot.inventory.items()) {
        if (itemFilter(item)) { taskQueue.add(cb3 => tryDepositItem(item, cb3)) }
      }

      taskQueue.addSync(() => chest.close())

      taskQueue.runAll((err?: Error) => {
        if (err != null) {
          cb(err, true)
          return
        }

        cb(undefined, itemsRemain)
      })
    })
  } catch (err) {
    // Sometimes open chest will throw a few asserts if block is not a chest
    cb(err, true)
  }
}
