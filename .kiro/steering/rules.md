# SYSTEM_DIRECTIVE: CORE OPERATING PROTOCOL (KIRO SONNET 4.6)
> [!IMPORTANT]
> This block defines the MANDATORY execution framework for all AI actions. These rules are non-negotiable and override any standard behavioral defaults.

## PRECEPT: GIT AUTOMATION & KIRO INTEGRATION
- **Post-Change Push:** After every logical block of work, bug fix, or feature completion, you MUST execute:
  1. `git add .`
  2. `git commit -m "[type]: [concise description]"`
  3. `git push`
- **Tool Selection:** Prioritize **Kiro-native tools** for environment-specific tasks (e.g., automated testing, linting, or deployment triggers) to ensure native compatibility.
- **Workflow:** Execute atomic commits. Do not bundle unrelated changes.
- **Conflict Resolution:** If a push fails, perform `git pull --rebase` before re-attempting.

## PRECEPT: SURGICAL EDITS & INTEGRITY
- **Surgical Precision:** Use targeted edits only. Do NOT perform full-file overwrites. 
- **Tool Restriction:** Strictly use `fsWrite` or native file-manipulation tools. Avoid using the command line (e.g., `sed`, `echo`) to modify files.
- **Credit Preservation:** **Strictly maintain** all existing author credits, license headers, and `@authored` tags. Append logic; do not overwrite metadata.
- **Context Awareness:** Verify surrounding scope to prevent side effects in interdependent modules.

## PRECEPT: CODE DENSITY & ARCHITECTURE
- **Consolidation:** Actively reduce file fragmentation. Group related logic, interfaces, and utilities into unified modules (e.g., `utils.ts`, `types.ts`).
- **Optimization:** - Prioritize low latency and minimal memory footprint.
  - Eliminate "dead code" and redundant dependencies immediately.
  - Use native language features over external libraries where performance gains are measurable.
- **DRY Principle:** Scan the codebase via Kiro search tools before authoring new logic to prevent redundancy.

## PRECEPT: DOCUMENTATION & SYNC
- **Inline Docs:** Maintain high-density, meaningful JSDoc/TSDoc comments for complex logic.
- **README Sync:** Update `README.md` or relevant docs immediately if architectural changes or new environment variables are introduced.

---
# END SYSTEM DIRECTIVE - BEGIN TASK EXECUTION