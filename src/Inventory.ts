import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Item } from 'prismarine-item'
import { goals } from 'mineflayer-pathfinder'
import { NoChestsError } from './errors/NoChestsError'

export type ItemFilter = (item: Item) => boolean

export interface InventoryOptions {
  bot: Bot
  chestLocations: Vec3[]
  itemFilter: ItemFilter
}

export async function emptyInventoryIfFull (options: InventoryOptions): Promise<void> {
  if (options.bot.inventory.emptySlotCount() > 0) return
  if (options.chestLocations.length === 0) throw new NoChestsError('There are no defined chest locations to empty inventory!')

  // Shallow clone so we can safely remove chests from the list that are full.
  const chestLocations = [...options.chestLocations]
  while (true) {
    const chestLocation = getClosestChest(options.bot, chestLocations)
    if (chestLocation == null) {
      throw new NoChestsError('All chests are full!')
    }

    if (await tryEmptyInventory(options, chestLocation)) return
  }
}

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

async function tryEmptyInventory (options: InventoryOptions, location: Vec3): Promise<boolean> {
  // @ts-expect-error
  const pathfinder: Pathfinder = bot.pathfinder
  const goto = pathfinder.goto

  await goto(new goals.GoalGetToBlock(location.x, location.y, location.z))
  return await placeItems(options, location)
}

async function placeItems (options: InventoryOptions, location: Vec3): Promise<boolean> {
  const chestBlock = options.bot.blockAt(location)
  if (chestBlock == null) throw new Error('Chest could not be loaded!')

  const chest = await options.bot.openChest(chestBlock)

  const window = chest.window
  if (window == null) throw new Error('Failed to open chest!')

  let hasRemain = false
  for (const item of options.bot.inventory.items()) {
    if (!options.itemFilter(item)) continue

    try {
      await chest.deposit(item.type, item.metadata, item.count)
    } catch (err) {
      hasRemain = true
    }
  }

  return hasRemain
}
