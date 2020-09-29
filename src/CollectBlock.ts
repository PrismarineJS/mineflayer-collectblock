import { Bot } from "mineflayer";
import { Block } from "prismarine-block";

export class CollectBlock
{
    private readonly bot: Bot;

    constructor(bot: Bot)
    {
        this.bot = bot;
    }

    collect(block: Block): void
    {
        // TODO
    }
}