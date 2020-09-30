const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder').pathfinder
const collectBlock = require('mineflayer-collectblock').plugin

if (process.argv.length < 4 || process.argv.length > 6) {
  console.log('Usage : node collector.js <host> <port> [<name>] [<password>]')
  process.exit(1)
}

const bot = mineflayer.createBot({
  host: process.argv[2],
  port: parseInt(process.argv[3]),
  username: process.argv[4] ? process.argv[4] : 'collector',
  password: process.argv[5]
})

bot.loadPlugin(pathfinder)
bot.loadPlugin(collectBlock)

let mcData;
bot.once('spawn', () => {
  mcData = require('minecraft-data')(bot.version)
})

bot.on('chat', (username, message) => {
  const args = message.split(" ")
  if (args[0] !== 'collect') return

  const blockType = mcData.blocksByName[args[1]]
  if (!blockType) {
    bot.chat("I don't know any blocks with that name.")
    return
  }

  bot.chat("Collecting the nearest " + blockType.name)

  const block = bot.findBlock({
    matching: blockType.id,
    maxDistance: 64,
  })

  if (!block) {
    bot.chat("I don't see that block nearby.")
    return
  }

  bot.collectBlock.collect(block, err => {
    if (err)
      bot.chat(err.message)
  })
})