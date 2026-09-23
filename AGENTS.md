# MoneyGraph frontend workflow

Shared copies of the project's frontend skills and supporting resources are in [.codex/skills/frontend-design](.codex/skills/frontend-design/README.md). Read the matching `SKILL.md` there if a named skill is not installed locally.

- Use the `moneygraph-frontend` and official `shadcn` skills for frontend work. Use shadcn MCP to inspect component APIs and examples. Prefer existing shadcn components over custom equivalents.
- For the right-hand Node Inspector, use Card, Badge, Tabs, Tooltip, ScrollArea, Progress, and Separator as appropriate.
- After significant UI implementation, use `frontend-qa`: run `npm run lint`, run `npm run build`, start the frontend, test core workflows with Playwright MCP, inspect the browser console, verify the 1440x900 layout, and test empty/loading/error states. Fix relevant failures and report anything still failing or blocked before declaring completion. Run commands from the frontend package; a missing app or script is not a passing check.
- Always use the OpenAI developer documentation MCP server when implementing or modifying OpenAI API functionality. Report missing MCP access explicitly.
- The teammate owns the backend. Inspect its branch and compare API contracts read-only when requested; do not modify that branch. Report affected frontend types and API calls with the compared refs.
- Follow `docs/project_description.md` and `starter/READ_2.md`. Treat roles as investigation hypotheses, preserve numerical evidence, and surface depth-4 truncation and incomplete seed inflows.
- Keep credentials out of source control and browser code. GitHub MCP reads `GITHUB_PAT_TOKEN` from the environment of the Codex process.
