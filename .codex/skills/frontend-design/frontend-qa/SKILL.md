---
name: frontend-qa
description: Verify significant MoneyGraph frontend changes with lint, production build, and Playwright MCP browser checks covering graph exploration, the Node Inspector, and empty/loading/error states.
---

# MoneyGraph frontend QA

Apply after significant MoneyGraph UI implementation and when asked to test its frontend. Locate the frontend package and read its scripts before running commands. If no runnable frontend exists, report that limitation; do not create an unrelated app just to run checks.

## Required workflow

1. Run `npm run lint` from the frontend package. Fix issues introduced by the change; report any pre-existing failures separately. A missing lint script is a missing check, not a pass.
2. Run `npm run build`. Resolve relevant compilation and type errors before browser verification. Respect the repository's package manager if it uses a different lockfile.
3. Start the frontend using its documented development or preview command. Reuse a healthy existing server when appropriate. Record the actual URL and any mock-data mode.
4. Use Playwright MCP to open the running app. If the MCP is unavailable, report browser QA as blocked and complete independent checks; do not claim browser success from a build alone.
5. Exercise the core workflows below that exist in the app. Record unimplemented workflows as unavailable instead of silently passing them.
6. Check browser console errors and failed network requests after interactions. Investigate failures introduced by the change.
7. Set the browser viewport to exactly 1440x900. Inspect a screenshot for clipped labels, unreadable graph legends, overlapping panels, unintended horizontal scrolling, and inaccessible inspector controls.
8. Verify empty, loading, and error states using deterministic fixtures, request interception, or the app's test mode. Verify recovery after retry and switching nodes. Restore normal responses afterward; never leave forced failures in production code.
9. Fix failures within the frontend scope and rerun affected checks. Report remaining failures and blocked checks before declaring completion. Stop retries when an external dependency or credential is required and clearly identify it.

## MoneyGraph workflows

- Load the network and verify visible flow direction and role/cluster legends.
- Search for an existing `gid`, select it, and confirm the inspector matches that same node. Test an unknown `gid` and clearing the search.
- Select a ranked node and a graph node; both paths must update the same selection. Switch nodes quickly to catch stale responses.
- Open the right-hand Node Inspector tabs, tooltips, and scroll areas. Verify incoming/outgoing amounts, transaction counts, role evidence, cluster, confidence, and priority against the actual API response or clearly labeled fixture.
- Exercise role and cluster filters and reset them. Test export/download controls if implemented.
- Inspect an isolated seed and a depth-4 node. Missing outgoing edges must not be presented as proof that funds stayed there; incomplete seed inflows must be acknowledged where ratios are shown.
- Verify the initial no-selection state, no results, delayed requests, and API failures. Unknown values must not silently become zero; stale node details must not remain under a new node heading.
- Check keyboard access, visible focus, tab navigation, accessible names for icon buttons, and readable labels beyond role colors.

## Report

Give lint/build results, tested URL, data source (real backend or fixtures), viewport, exercised workflows, and concrete failures or blockers. Include screenshot paths when captured. Distinguish mocked UI validation from real backend integration. Stop only servers started for this QA run when they are no longer needed.
