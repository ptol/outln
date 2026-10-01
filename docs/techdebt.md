---
description: Durable registry of known technical debt, with impact and mitigation direction.
---

# Technical Debt

## Purpose

- Track high-value technical debt that affects maintainability, reliability, or delivery speed.
- Keep entries durable and project-level, not iteration journals.

## Entry Format

- `Area`: subsystem, component, or file path.
- `Issue`: concise description of the debt.
- `Impact`: concrete cost or risk.
- `Mitigation`: preferred remediation direction.

## Items

- `Area`: `src/languages/markdown/engine.ts`
  - `Issue`: Headings are found with a line regex; setext headings (`===`/`---` underlines), `~~~` fences, indented fences and fence-length matching are not handled.
  - `Impact`: Some Markdown files get missing or extra headings and wrong section ranges.
  - `Mitigation`: Use a CommonMark-compliant block parser (or tree-sitter-markdown) for heading and fence detection.
