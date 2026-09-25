const assert = require('node:assert/strict')
const { test } = require('node:test')
const { CollectBlock } = require('../lib/CollectBlock')

for (const withOptions of [false, true]) {
  test(`collect callback retains its instance with${withOptions ? '' : 'out'} options`, async () => {
    const collector = Object.create(CollectBlock.prototype)
    collector.bot = { pathfinder: null }
    collector.targets = {}
    collector.movements = null

    const error = await new Promise(resolve => {
      if (withOptions) collector.collect(null, {}, resolve)
      else collector.collect(null, resolve)
    })

    assert.equal(error.name, 'UnresolvedDependency')
    assert.match(error.message, /mineflayer-pathfinder/)
  })
}
