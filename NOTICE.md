# Notice

This project is a fork of [ishu86/after-effects-mcp](https://github.com/ishu86/after-effects-mcp) (MIT, copyright 2024 Ishant Kohar). The original license is kept in `LICENSE`.

## Goal of this fork

Extend the upstream server for LIEBLINGSKORB ad work:

1. `run_script`: send raw ExtendScript through the existing file communicator.
2. `ae_find_tool` / `ae_recipe`: search an index of tool descriptions and tested recipes, so only relevant tools are loaded into the AI context.
3. A small core tool list; the remaining tools are reached through search and `ae_call`.
4. Brand recipes: sticker pop-in/out, wiggle, caption styles, push-ins.

## Status

Implemented in v1.1.0: `run_script`, `ae_find_tool`, `ae_call`, `ae_recipe` (6 recipes), a lean default tool list (`AE_MCP_TOOL_MODE=full` for all tools). The recipes were run once in After Effects 2026 through `AfterFX.exe -r`; the CEP bridge itself was not changed. Not tested on After Effects 2027.

## Code borrowed from other projects

None. The meta tools and recipes are original code. Only the idea of a raw script tool comes from other servers (for example Dakkshin/after-effects-mcp); no code was copied.
