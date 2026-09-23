---
name: moneygraph-frontend
description: Build or modify the MoneyGraph frontend and right-hand Node Inspector using shadcn components and the backend API contract, preserving financial-data limitations and explainable investigation hypotheses.
---

# MoneyGraph frontend

Read the repository instructions, `starter/project_description.md`, and `starter/READ_2.md` when available. Locate the actual frontend package, `components.json`, styles, and API types before editing. Use the installed shadcn skill and shadcn MCP to inspect component APIs and examples before composing UI. If MCP tools are unavailable, report the limitation and use official shadcn documentation without claiming MCP usage.

## Component choices

Use existing shadcn components where appropriate; do not invent custom equivalents. For the right-hand Node Inspector use Card, Badge, Tabs, Tooltip, ScrollArea, Progress, and Separator. Check installed component variants and base library instead of assuming Radix or Base UI APIs. Use the registry CLI to add missing components to an initialized app.

Keep the selected `gid` consistent between graph, priority list, and inspector. Show numerical evidence, incoming/outgoing flows and transaction counts, cluster, priority, and role confidence. Convert API scores from 0–1 to percentages only for presentation. Do not describe heuristic confidence as a calibrated probability of guilt. Missing data needs an explicit unknown state.

Depth-4 nodes are boundary observations; no visible outflow does not establish a terminal recipient. Seed incoming amounts are incomplete. Present roles and coordinator status as hypotheses for investigation. Do not invent identities, balances, customer attributes, API endpoints, or role evidence. Keep loading, empty, error, and no-selection states explicit.

Bklit UI is optional for a specific component need not covered by the existing shadcn setup. Inspect its official skill and dependencies before adding a component. Agentation is optional development feedback tooling; integrate it only for a requested annotation workflow and keep it out of production builds.

## Backend coordination

The teammate owns the backend. For contract review, inspect the requested backend branch using GitHub MCP or read-only local Git commands. Do not switch, merge, reset, push, or modify that branch. If the branch cannot be identified from project context, ask for its name while continuing independent frontend work.

Compare API routes, HTTP methods, request/response schemas, nullability, role enums, pagination, and error shapes against the frontend branch. Report the compared refs or commit IDs and which frontend types/calls need updating. Treat documented CSV schemas as export contracts, not proof of an HTTP API. Keep fixtures clearly separate from real API responses.

Always use the OpenAI developer documentation MCP server when implementing or modifying OpenAI API functionality. If unavailable, complete independent work and report the integration blocker; do not silently substitute remembered API behavior. Keep API credentials server-side.

After significant UI implementation, apply the frontend-qa skill: lint, build, run the app, test with Playwright MCP at 1440x900, inspect console/network failures, and test empty/loading/error states. Report failures before claiming completion.
