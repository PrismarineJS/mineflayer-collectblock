# API <!-- omit in toc -->

Welcome to the *mineflayer-collectblock* API documentation page.

## Table of Contents <!-- omit in toc -->

- [1. Summary](#1-summary)
- [Properties](#properties)
  - [`bot.collectblock.movements: Movements`](#botcollectblockmovements-movements)
- [Functions](#functions)
  - [`bot.collectblock.collect(target: Collectable | Collectable[], cb: (err?: Error) => void): void`](#botcollectblockcollecttarget-collectable--collectable-cb-err-error--void-void)

## 1. Summary

The collect block plugin is a utility plugin that can be used to help make collecting blocks and item drops very easy, using only a single API call. No need to worry about pathfinding to the block, selecting the right tool, or moving to pick up the item drop after mining.

## Properties

### `bot.collectblock.movements: Movements`

The movements object used by the pathfinder plugin to define the movement configuration. This object is passed to the pathfinder plugin when any API from this plugin is called in order to control how pathfinding should work when collecting the given blocks or item.

If set to null, the pathfinder plugin movements is not updated.

Defaults to a new movements object instance.

## Functions

### `bot.collectblock.collect(target: Collectable | Collectable[], cb: (err?: Error) => void): void`

Causes the bot to collect the given block, item drop, or list of those. If the target is a block, the bot will move to the block, mine it, and pick up the item drop. If the target is an item drop, the bot will move to the item drop and pick it up. If the target is a list of collectables, the bot will move from target to target in order of closest to furthest and collect each target in turn.