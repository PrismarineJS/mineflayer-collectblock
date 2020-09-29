import { Bot } from "mineflayer";
import { CollectBlock } from "./CollectBlock";

export function plugin(bot: Bot)
{
    // @ts-ignore
    bot.collectBlock = new CollectBlock(bot);
}