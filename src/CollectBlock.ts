import { Bot } from 'mineflayer';
import { Block } from 'prismarine-block';
import { Movements, goals, Result } from 'mineflayer-pathfinder';
import { TemporarySubscriber } from 'mineflayer-utils';
import { Entity } from 'prismarine-entity';

type Callback = (err?: Error) => void;
type Collectable = Block | Entity;

/**
 * Creates a new error object with the given type and message.
 * 
 * @param type - The error type.
 * @param message - The error message.
 * 
 * @returns The error object.
 */
function err(type: string, message: string): Error
{
    const e = new Error(message);
    e.name = type;
    return e;
}

function collectAll(bot: Bot, targets: Collectable[], cb: Callback): void
{
    const tempEvents = new TemporarySubscriber(bot);

    tempEvents.subscribeTo('entityGone', (entity: Entity) =>
    {
        const index = targets.indexOf(entity);
        if (index >= 0)
            targets.splice(index, 1);
    });

    const collectNext = (error?: Error) => {
        if (error)
        {
            tempEvents.cleanup();
            cb(error);
            return;
        }

        const closest = getClosest(bot, targets);

        if (!closest)
        {
            tempEvents.cleanup();
            cb();
            return;
        }

        if (closest.constructor.name === Block.name)
            collectBlock(bot, <Block>closest, targets, collectNext);
        else if (closest.constructor.name === Entity.name)
            collectItem(bot, <Entity>closest, collectNext);
        else
            cb(err('UnknownType', `Target ${closest.name} is not a Block or Entity!`));
    }

    collectNext();
}

function getClosest(bot: Bot, targets: Collectable[]): Collectable | null
{
    let closest: Collectable | null = null;
    let distance: number = 0;

    for (const target of targets)
    {
        const dist = target.position.distanceTo(bot.entity.position);

        if (!closest || dist < distance)
        {
            closest = target;
            distance = dist;
        }
    }

    return closest;
}

function collectBlock(bot: Bot, block: Block, targets: Collectable[], cb: Callback): void
{
    if (!block)
        return;

    if (!cb)
        cb = () => { }

    // @ts-ignore
    const pathfinder = this.bot.pathfinder;

    const goal = new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z);
    pathfinder.setGoal(goal);

    const tempEvents = new TemporarySubscriber(bot);

    tempEvents.subscribeTo('goal_reached', () =>
    {
        tempEvents.cleanup();
        mineBlock(bot, block, targets, cb);
    });

    tempEvents.subscribeTo('goal_updated', () => {
        tempEvents.cleanup();
        cb(err('PathfindingInterrupted', 'Pathfinding interrupted before block reached.'));
    })

    tempEvents.subscribeTo('path_update', (results: Result) =>
    {
        if (results.status === 'noPath')
        {
            tempEvents.cleanup();
            cb(err('NoPath', 'No path to target block!'));
        }
    });
}

function mineBlock(bot: Bot, block: Block, targets: Collectable[], cb: Callback): void
{
    selectBestTool(bot, block, () =>
    {
        const tempEvents = new TemporarySubscriber(bot);

        tempEvents.subscribeTo('itemDrop', (entity: Entity) =>
        {
            if (entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= 0.5)
                targets.push(entity);
        });

        bot.dig(block, (err?: Error) =>
        {
            if (err)
            {
                tempEvents.cleanup();
                cb(err);
                return;
            }

            const index = targets.indexOf(block);
            if (index >= 0)
                targets.splice(index, 1);

            let remainingTicks = 10;
            tempEvents.subscribeTo('physicTick', () =>
            {
                remainingTicks--;

                if (remainingTicks <= 0)
                {
                    tempEvents.cleanup();
                    cb();
                }
            })
        });
    });
}

function selectBestTool(bot: Bot, block: Block, cb: () => void): void
{
    // @ts-ignore
    const pathfinder = this.bot.pathfinder;
    const tool = pathfinder.bestHarvestTool(block);

    if (tool)
        bot.equip(tool, 'hand', cb);
    else
        cb();
}

function collectItem(bot: Bot, targetEntity: Entity, cb: Callback): void
{
    const goal = new goals.GoalFollow(targetEntity, 0);

    // @ts-ignore
    const pathfinder = bot.pathfinder;
    pathfinder.setGoal(goal, true);

    const tempEvents = new TemporarySubscriber(bot);

    tempEvents.subscribeTo('entityGone', (entity: Entity) =>
    {
        if (entity === targetEntity)
        {
            tempEvents.cleanup();
            cb();
        }
    });

    tempEvents.subscribeTo('goal_updated', (newGoal: goals.Goal | null) => {
        if (newGoal === goal) return;
        tempEvents.cleanup();
        cb(err('PathfindingInterrupted', 'Pathfinding interrupted before item could be reached.'));
    })
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
        this.movements = new Movements(bot, require('minecraft-data')(bot.version))
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
     * @param cb - The callback that is called finished.
     */
    collect(target: Collectable | Collectable[], cb: Callback): void
    {
        let targetArray;
        if (Array.isArray(target)) targetArray = target;
        else targetArray = [target];

        // @ts-ignore
        if (!this.bot.pathfinder)
        {
            cb(err('UnresolvedDependency', 'The mineflayer-collectblock plugin relies on the mineflayer-pathfinder plugin to run!'));
            return;
        }
    
        if (this.movements)
            // @ts-ignore
            this.bot.pathfinder.setMovements(this.movements);

        collectAll(this.bot, targetArray, cb);
    }
}