docs/
overview.md – Project overview (current and future functionality of the project)
architecture.md – High-level architecture and design overview
adr.md – Architecture Decision Records
runbook.md – Operational guide (run, debug)
changelog.md – Notable changes by date
til.md – "Today I Learned": development learnings and gotchas
testing.md - how to use two-section tests
techdebt.md - durable technical debt register

# Outln

- `outln` is a global command
- `outln` prints a compact structural outline of a file (for example, headers and top-level definitions) so you can understand layout before reading full content.
- Before opening any `.ts`, `.tsx`, or `.md` file you can run `outln [FILE]...` first and review the outline before reading file contents to reduce context usage.
- It includes line ranges (like `[L1-L10]`), use those ranges to read only the relevant part of the file when possible.
- Structure source files so `outln` output is clear and useful: keep top-level definitions focused, use descriptive names, and avoid large unstructured blocks.
- When creating or modifying a Markdown file, ensure it has YAML frontmatter with a `description` and clear section headers (`#`, `##`, `###`) so `outln` returns a useful structure.

# Code:

Use @codestyle.md
