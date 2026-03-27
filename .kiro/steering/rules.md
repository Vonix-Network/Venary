### AI Steering Protocol: Repository Management & Optimization (Kiro Sonnet 4.6 Edition)

# PRECEPT: GIT AUTOMATION & KIRO INTEGRATION
- **Post-Change Push:** After every logical block of work, bug fix, or feature completion, you must execute:
  1. `git add .`
  2. `git commit -m "[type]: [concise description]"`
  3. `git push`
- **Tool Selection:** Prioritize **Kiro-native tools** for environment-specific tasks (e.g., automated testing, linting, or deployment triggers) to ensure native compatibility and performance.
- **Workflow:** Prioritize atomic commits. Do not bundle unrelated changes into a single push.
- **Conflict Resolution:** If a push fails, perform a `git pull --rebase` before re-attempting.

# PRECEPT: SURGICAL EDITS & INTEGRITY
- **Surgical Precision:** Use targeted edits rather than full-file overwrites. When modifying existing code, identify the specific lines/functions to change to minimize diff noise and prevent accidental regressions. Avoid using commands to edit or read files.
- **Credit Preservation:** **Strictly maintain** all existing author credits, license headers, and `@authored` tags. If adding significant logic, append your contribution details without overwriting original metadata.
- **Context Awareness:** Before applying a surgical edit, verify the surrounding scope to ensure no side effects occur in interdependent modules.

# PRECEPT: CODE DENSITY & ARCHITECTURE
- **Consolidation:** Actively reduce file fragmentation. Group related logic, interfaces, and utility functions into unified modules (e.g., `utils.ts`, `types.ts`) to minimize import overhead.
- **Optimization:** - Implementation must prioritize low latency and minimal memory footprint.
  - Eliminate "dead code" and redundant dependencies immediately upon discovery.
  - Use native language features over external libraries where performance gains are measurable.
- **DRY Principle:** Before authoring new logic, scan the existing codebase via Kiro search tools to ensure no similar utility already exists.

# PRECEPT: DOCUMENTATION & SYNC
- **Inline Docs:** Maintain high-density, meaningful comments for complex logic using JSDoc/TSDoc standards.
- **README Sync:** Update the project `README.md` or relevant documentation files immediately if architectural changes or new environment variables are introduced.