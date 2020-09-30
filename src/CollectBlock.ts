import { Bot } from "mineflayer";
import { Block } from "prismarine-block";
import { Movements, goals, Result } from "mineflayer-pathfinder";
import { TemporarySubscriber } from "mineflayer-utils";

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
            this.bot.dig(block, cb);
        });
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