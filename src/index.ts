import { Bot } from 'mineflayer';
import { CollectBlock } from './CollectBlock';
import { pathfinder } from 'mineflayer-pathfinder';

export function plugin(bot: Bot)
{
    // @ts-ignore
    bot.collectBlock = new CollectBlock(bot);

    // Load pathfinder if not loaded manually.
    setTimeout(() => loadPathfinder(bot), 0)
}

function loadPathfinder(bot: Bot)
{
    // @ts-ignore
    if (bot.pathfinder) return;

    bot.loadPlugin(pathfinder);
}