# Notice

This project is a fork of [ishu86/after-effects-mcp](https://github.com/ishu86/after-effects-mcp) (MIT, copyright 2024 Ishant Kohar). The original license is kept in `LICENSE`.

## Goal of this fork

Extend the upstream server for LIEBLINGSKORB ad work:

1. `run_script`: send raw ExtendScript through the existing file communicator.
2. `ae_find_tool` / `ae_recipe`: search an index of tool descriptions and tested recipes, so only relevant tools are loaded into the AI context.
3. A small core tool list; the remaining tools are reached through search and `ae_call`.
4. Brand recipes: sticker pop-in/out, wiggle, caption styles, push-ins.

## Status

Planned. Only the upstream code exists so far. Not yet tested on After Effects 2026/2027.

## Code borrowed from other projects

None yet. Anything copied later must be listed here with source URL and license.
