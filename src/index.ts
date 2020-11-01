import { Bot } from 'mineflayer'
import { CollectBlock } from './CollectBlock'
import { pathfinder } from 'mineflayer-pathfinder'

export function plugin (bot: Bot): void {
  // @ts-expect-error
  bot.collectBlock = new CollectBlock(bot)

  // Load pathfinder if not loaded manually.
  setTimeout(() => loadPathfinder(bot), 0)
}

function loadPathfinder (bot: Bot): void {
  // @ts-expect-error
  if (bot.pathfinder != null) return

  bot.loadPlugin(pathfinder)
}
