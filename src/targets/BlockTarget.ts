import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Block } from 'prismarine-block'
import { goals, Pathfinder } from 'mineflayer-pathfinder'
import { CollectOptionsFull } from '../CollectBlock'
import { promisify } from 'util'
import { Entity } from 'prismarine-entity'
import { CollectTarget } from './Targets'
import { ItemDropTarget } from './ItemDropTarget'

export class BlockTarget extends CollectTarget {
  private readonly position: Vec3
  private readonly bot: Bot
  private readonly options: CollectOptionsFull

  constructor (bot: Bot, block: Block, options: CollectOptionsFull) {
    super()
    this.position = block.position.clone()
    this.bot = bot
    this.options = options
  }

  distance (): number {
    return this.bot.entity.position.distanceTo(this.position)
  }

  async collect (): Promise<void> {
    // Do nothing if block is no longer there.
    const block = this.bot.blockAt(this.position)
    if (block == null || block.type === 0) return

    const pathfinder: Pathfinder = this.bot.pathfinder
    const goto = promisify(pathfinder.goto)

    // TODO Listen for block breaks while pathfinding
    // Cancel and return instantly if block is invalidated before we reach it

    await goto(new goals.GoalGetToBlock(this.position.x, this.position.y, this.position.z))
    await this.selectBestTool()
    await this.mineBlock()
  }

  private async selectBestTool (): Promise<void> {
    // Do nothing if block is no longer there.
    const block = this.bot.blockAt(this.position)
    if (block == null || block.type === 0) return

    const options = {
      requireHarvest: true,
      getFromChest: true,
      maxTools: 2
    }

    const toolPlugin: Tool = this.bot.tool
    const equipForBlock = promisify(toolPlugin.equipForBlock)
    await equipForBlock(block, options)
  }

  private async mineBlock (): Promise<void> {
    const block = this.bot.blockAt(this.position)
    if (block == null || block.type === 0) return

    const itemDropListener = (entity: Entity): void => {
      if (entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= 0.5) {
        const entityTarget = new ItemDropTarget(this.bot, entity)
        this.options.targets.appendTarget(entityTarget)
      }
    }
    this.bot.on('itemDrop', itemDropListener)

    await this.bot.dig(block)
    await this.waitForTicks(10)

    this.bot.removeListener('itemDrop', itemDropListener)
  }

  private async waitForTicks (count: number): Promise<void> {
    await new Promise<void>(resolve => {
      let ticksRemaining = count
      const tickListener = (): void => {
        ticksRemaining--
        if (ticksRemaining === 0) {
          this.bot.removeListener('physicTick', tickListener)
          resolve()
        }
      }

      this.bot.on('physicTick', tickListener)
    })
  }
}
