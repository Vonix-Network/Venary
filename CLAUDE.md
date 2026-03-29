\# CLAUDE CODE PRECEPTS: PROJECT KIRO



\## 1. GIT AUTOMATION \& ATOMIC WORKFLOW

\- \*\*Post-Change Protocol:\*\* After every logical block, bug fix, or feature completion, you MUST:

&#x20; 1. `run\_terminal\_command` with `git add .`

&#x20; 2. `run\_terminal\_command` with `git commit -m "\[type]: \[concise description]"`

&#x20; 3. `run\_terminal\_command` with `git push`

\- \*\*Conflict Resolution:\*\* If a push fails, execute `git pull --rebase` before re-attempting.

\- \*\*Workflow:\*\* Execute atomic commits. Do not bundle unrelated changes.



\## 2. SURGICAL EDITS \& INTEGRITY

\- \*\*Surgical Precision:\*\* Use `edit\_file` for targeted changes. Do NOT perform full-file overwrites or use `write\_to\_file` on existing source code.

\- \*\*Tool Restriction:\*\* Strictly avoid terminal-based file manipulation (e.g., `sed`, `echo`, `cat`). Use native tool calls only.

\- \*\*Credit Preservation:\*\* \*\*Strictly maintain\*\* all existing author credits, license headers, and `@authored` tags. Append logic; do not overwrite metadata.

\- \*\*Context Awareness:\*\* Verify surrounding scope to prevent side effects in interdependent modules before submitting.



\## 3. KIRO INTEGRATION \& TOOL SELECTION

\- \*\*Tool Priority:\*\* Prioritize \*\*Kiro-native tools\*\* via `run\_terminal\_command` for environment-specific tasks (testing, linting, deployment triggers) to ensure native compatibility.

\- \*\*DRY Principle:\*\* Scan the codebase using `grep\_search` or Kiro search utilities before authoring new logic to prevent redundancy.



\## 4. CODE DENSITY \& ARCHITECTURE

\- \*\*Consolidation:\*\* Actively reduce file fragmentation. Group related logic, interfaces, and utilities into unified modules (e.g., `utils.ts`, `types.ts`).

\- \*\*Optimization:\*\*

&#x20; - Prioritize low latency and minimal memory footprint.

&#x20; - Eliminate "dead code" and redundant dependencies immediately.

&#x20; - Use native language features over external libraries where performance gains are measurable.



\## 5. DOCUMENTATION \& SYNC

\- \*\*Inline Docs:\*\* Maintain high-density, meaningful JSDoc/TSDoc comments for complex logic.

\- \*\*README Sync:\*\* Update `README.md` or relevant architecture docs immediately if architectural changes or new environment variables are introduced.



\---

\# END SYSTEM DIRECTIVE - BEGIN TASK EXECUTION

