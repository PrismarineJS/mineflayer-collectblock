### 1.5.0
* [Create commands.yml](https://github.com/PrismarineJS/mineflayer-collectblock/commit/37fdb61fc1c9e038a4a8a880deece90dee2d3520) (thanks @rom1504)
* [Fix collect blocks that require tools (#132)](https://github.com/PrismarineJS/mineflayer-collectblock/commit/5dbaed726f8f7d750a51531b443495270be59585) (thanks @MaxRobinsonTheGreat)
* [Change physicTick to new physicsTick (#131)](https://github.com/PrismarineJS/mineflayer-collectblock/commit/c7f44d7c8c1a9a03dbca696b41c3758a481ce4d5) (thanks @SilkePilon)
* [fix: add declaration for mineflayer plugin in index.ts (#128)](https://github.com/PrismarineJS/mineflayer-collectblock/commit/51363f4478e75e644a0f26d9b1dad377d4d5c4c6) (thanks @Wyatt-Stanke)
* [Bump @types/node from 17.0.45 to 18.6.4 (#108)](https://github.com/PrismarineJS/mineflayer-collectblock/commit/c5f9aeb5bf5d6c192e7a75455e8044c5723a57c6) (thanks @dependabot[bot])
* [Update README.md (#94)](https://github.com/PrismarineJS/mineflayer-collectblock/commit/08997f52464c219bb4ce9fd1c5eafa9f3af02482) (thanks @TheDudeFromCI)

<h1 align="center">mineflayer-collectblock</h1>
<p align="center"><i>A small utility plugin for allowing users to collect blocks using a higher level API.</i></p>

<p align="center">
  <img src="https://github.com/TheDudeFromCI/mineflayer-collectblock/workflows/Build/badge.svg" />
  <a href="https://www.npmjs.com/package/mineflayer-collectblock"><img src="https://img.shields.io/npm/v/mineflayer-collectblock" /></a>
  <img src="https://img.shields.io/github/repo-size/TheDudeFromCI/mineflayer-collectblock" />
  <img src="https://img.shields.io/npm/dm/mineflayer-collectblock" />
  <img src="https://img.shields.io/github/contributors/TheDudeFromCI/mineflayer-collectblock" />
  <img src="https://img.shields.io/github/license/TheDudeFromCI/mineflayer-collectblock" />
</p>

---

## Showcase

You can see a video of the plugin in action, [here.](https://youtu.be/5T_rcCnNnf4)
The source code of the bot in the video can be seen in the examples folder, [here.](https://github.com/TheDudeFromCI/mineflayer-collectblock/blob/master/examples/collector.js)

### Description

This plugin is a wrapper for mineflayer that allows for easier API usage when collecting blocks or item drops. This plugin is designed to reduce some of the boilerplate code based around the act of pathfinding to a block _(handled by_ ***mineflayer-pathfinder***_)_, selecting the best tool to mine that block _(handled by_ ***mineflayer-tool***_)_, actually mining it, then moving to collect the item drops from that block. This plugin allows for all of that basic concept to be wrapped up into a single API function.

In addition to the usage above, some additional quality of life features are available in this plugin. These include the ability to automatically deposit items into a chest when the bot's inventory is full, collecting new tools from a chest if the bot doesn't currently have a required tool _(also handled by_ ***mineflayer-tool***_)_, and allowing for queueing of multiple blocks or item drops to the collection task, so they can be processed later.

### Getting Started

This plugin is built using Node and can be installed using:
```bash
npm install --save mineflayer-collectblock
```

### Simple Bot

The brief description goes here.

```js
// Create your bot
const mineflayer = require("mineflayer")
const bot = mineflayer.createBot({
  host: 'localhost',
  username: 'Player',
})
let mcData

// Load collect block
bot.loadPlugin(require('mineflayer-collectblock').plugin)

async function collectGrass() {
  // Find a nearby grass block
  const grass = bot.findBlock({
    matching: mcData.blocksByName.grass_block.id,
    maxDistance: 64
  })

  if (grass) {
    // If we found one, collect it.
    try {
      await bot.collectBlock.collect(grass)
      collectGrass() // Collect another grass block
    } catch (err) {
      console.log(err) // Handle errors, if any
    }
  }
}

// On spawn, start collecting all nearby grass
bot.once('spawn', () => {
  mcData = require('minecraft-data')(bot.version)
  collectGrass()
})
```

### Documentation

[API](https://github.com/TheDudeFromCI/mineflayer-collectblock/blob/master/docs/api.md)

[Examples](https://github.com/TheDudeFromCI/mineflayer-collectblock/tree/master/examples)

### License

This project uses the [MIT](https://github.com/TheDudeFromCI/mineflayer-collectblock/blob/master/LICENSE) license.

### Contributions

This project is accepting PRs and Issues. See something you think can be improved? Go for it! Any and all help is highly appreciated!

For larger changes, it is recommended to discuss these changes in the issues tab before writing any code. It's also preferred to make many smaller PRs than one large one, where applicable.
