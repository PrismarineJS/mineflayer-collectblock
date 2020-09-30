import { Bot } from "mineflayer";
import { Block } from "prismarine-block";
import { Movements, goals, Result } from "mineflayer-pathfinder";
import { TemporarySubscriber } from "mineflayer-utils";
import { Entity } from "prismarine-entity";

/**
 * Creates a new error object with the given type and message.
 * 
 * @param type - The error type.
 * @param message - The error message.
 * 
 * @returns The error object.
 */
function err(type: string, message: string)
{
    const e = new Error(message);
    e.name = type;
    return e;
}

/**
 * The collect block plugin.
 */
export class CollectBlock
{
    /**
     * The bot.
     */
    private readonly bot: Bot;

    /**
     * The movements configuration to be sent to the pathfinder plugin.
     */
    movements?: Movements;

    /**
     * Creates a new instance of the create block plugin.
     * 
     * @param bot - The bot this plugin is acting on.
     */
    constructor(bot: Bot)
    {
        this.bot = bot;
    }

    /**
     * Causes the bot to break and collect the target block.
     * 
     * @param block - The block to break and attempt to collect.
     * @param cb - The callback that is called finished.
     */
    collect(block: Block, cb: (err?: Error) => void): void
    {
        if (!block)
            return;

        // @ts-ignore
        const pathfinder = this.bot.pathfinder;

        if (!pathfinder)
        {
            cb(err('UnresolvedDependency', 'The mineflayer-collectblock plugin relies on the mineflayer-pathfinder plugin to run!'));
            return;
        }
            
        if (!this.movements)
        {
            const mcData = require('minecraft-data')(this.bot.version);
            this.movements = new Movements(this.bot, mcData);
        }

        const goal = new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z);
        pathfinder.setMovements(this.movements);
        pathfinder.setGoal(goal);

        const tempEvents = new TemporarySubscriber(this.bot);

        tempEvents.subscribeTo('goal_reached', () => {
            tempEvents.cleanup();
            this.mineBlock(block, cb);
        });

        tempEvents.subscribeTo('path_update', (results: Result) => {
            if (results.status === 'noPath')
            {
                tempEvents.cleanup();
                cb(err('NoPath', 'No path to target block!'));
            }
        });
    }

    private mineBlock(block: Block, cb: (err?: Error) => void): void
    {
        this.selectBestTool(block, () => {
            const tempEvents = new TemporarySubscriber(this.bot);

            const itemDrops: Entity[] = [];
            tempEvents.subscribeTo('itemDrop', (entity: Entity) => {
                if (entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= 0.5)
                    itemDrops.push(entity);
            });

            this.bot.dig(block, (err?: Error) => {
                if (err)
                {
                    tempEvents.cleanup();
                    cb(err);
                    return;
                }

                let remainingTicks = 10;
                tempEvents.subscribeTo('physicTick', () => {
                    remainingTicks--;

                    if (remainingTicks <= 0)
                    {
                        tempEvents.cleanup();
                        this.collectItemDrops(itemDrops, cb);
                    }
                })
            });
        });
    }

    private closestEntity(entities: Entity[]): Entity | undefined
    {
        let e = undefined;
        let distance = 0;

        for (const entity of entities)
        {
            const dist = entity.position.distanceTo(this.bot.entity.position);
            if (!entity || dist < distance)
            {
                e = entity;
                distance = dist;
            }
        }

        return e;
    }

    private collectItemDrops(itemDrops: Entity[], cb: (err?: Error) => void): void
    {
        if (itemDrops.length === 0)
        {
            cb();
            return;
        }

        let targetEntity: Entity | undefined;
        const collectNext = () => {
            targetEntity = this.closestEntity(itemDrops);
            
            // @ts-ignore
            const pathfinder = this.bot.pathfinder;
            pathfinder.setGoal(new goals.GoalFollow(targetEntity, 0), true);
        }

        const tempEvents = new TemporarySubscriber(this.bot);
        tempEvents.subscribeTo('entityGone', (entity: Entity) => {
            const index = itemDrops.indexOf(entity);
            if (index >= 0)
               itemDrops.splice(index, 1);

            if (itemDrops.length === 0)
            {
                // @ts-ignore
                this.bot.pathfinder.setGoal(null);

                tempEvents.cleanup();
                cb();

                return;
            }

            if (entity === targetEntity)
                collectNext();
        });

        collectNext();
    }

    private selectBestTool(block: Block, cb: () => void): void
    {
        // @ts-ignore
        const pathfinder = this.bot.pathfinder;
        const tool = pathfinder.bestHarvestTool(block);

        if (tool)
            this.bot.equip(tool, 'hand', cb);
        else
            cb();
    }
}