import { Bot } from 'mineflayer'
import { Callback } from './CollectBlock'
import { Vec3 } from 'vec3'
import { error } from './Util'
import { Item } from 'prismarine-item'
import { TaskQueue } from './TaskQueue'
import { goals } from 'mineflayer-pathfinder'

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

export async function emptyInventoryIfFull (bot: Bot, chestLocations: Vec3[], itemFilter: ItemFilter, cb?: Callback): Promise<void> {
  if (bot.inventory.emptySlotCount() > 0) {
    if ((cb != null) && typeof cb === 'function') cb()
    return
  }

  await emptyInventory(bot, chestLocations, itemFilter)
}

export async function emptyInventory (bot: Bot, chestLocations: Vec3[], itemFilter: ItemFilter, cb?: Callback): Promise<void|Error> {
  if (chestLocations.length === 0) {
    const err = error('NoChests', 'There are no defined chest locations!')
    if ((cb != null) && typeof cb === 'function') cb(err)
    throw err
  }

  // Shallow clone so we can safely remove chests from the list that are full.
  chestLocations = [...chestLocations]

  const tryNextChest = async (): Promise<void> => {
    const chest = getClosestChest(bot, chestLocations)

    if (chest == null) {
      const err = error('NoChests', 'All chests are full.')
      if ((cb != null) && typeof cb === 'function') cb(err)
      throw err
    }

    try {
      const hasRemaining = await tryEmptyInventory(bot, chest, itemFilter)
      if (!hasRemaining) {
        if ((cb != null) && typeof cb === 'function') cb()
        return
      }
    } catch (err: any) {
      if ((cb != null) && typeof cb === 'function') cb(err)
      throw err
    }
    await tryNextChest()
  }

  await tryNextChest()
}

async function tryEmptyInventory (bot: Bot, chestLocation: Vec3, itemFilter: ItemFilter, cb?: (err: Error | undefined, hasRemaining: boolean) => void): Promise<{ error: Error | undefined, hasRemaining: boolean }> {
  try {
    await gotoChest(bot, chestLocation)
  } catch (err: any) {
    if ((cb != null) && typeof cb === 'function') cb(err, true)
    throw err
  }
  try {
    return await placeItems(bot, chestLocation, itemFilter)
  } catch (err: any) {
    if ((cb != null) && typeof cb === 'function') cb(err, true)
    throw err
  }
}

async function gotoChest (bot: Bot, location: Vec3, cb?: Callback): Promise<void> {
  const pathfinder = bot.pathfinder

  try {
    await pathfinder.goto(new goals.GoalGetToBlock(location.x, location.y, location.z))
  } catch (err: any) {
    // error('NoPath', 'No path to target block!') ?
    // error('PathfindingInterrupted', 'Pathfinding interrupted before item could be reached.') ?
    if ((cb != null) && typeof cb === 'function') cb(err)
    throw err
  }
}

async function placeItems (bot: Bot, chestPos: Vec3, itemFilter: ItemFilter, cb?: (err: Error | undefined, hasRemaining: boolean) => void): Promise<{ error: Error | undefined, hasRemaining: boolean }> {
  return await new Promise((resolve, reject) => {
    const chestBlock = bot.blockAt(chestPos)
    if (chestBlock == null) {
      const err = error('UnloadedChunk', 'Chest is in an unloaded chunk!')
      if ((cb != null) && typeof cb === 'function') cb(err, true)
      reject({ error: err, hasRemaining: true })
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
          // @ts-expect-error
          chest.deposit(item.type, item.metadata, item.count).then(() => cb2()).catch(err => cb2(err))
        }

        const taskQueue = new TaskQueue()
        for (const item of bot.inventory.items()) {
          if (itemFilter(item)) { taskQueue.add(cb3 => tryDepositItem(item, cb3)) }
        }

        // @ts-expect-error
        taskQueue.addSync(() => chest.close())

        taskQueue.runAll((err?: Error) => {
          if (err != null) {
            reject({ error: err, hasRemaining: true })
            return
          }

          resolve({ error: undefined, hasRemaining: itemsRemain })
        })
      })
    } catch (err: any) {
      // Sometimes open chest will throw a few asserts if block is not a chest
      resolve({ error: err, hasRemaining: true })
    }
  })
}
