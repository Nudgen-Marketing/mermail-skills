# Tool routing for mermail-pr-reviewer

This skill owns no MCP tools. It routes to existing owners and never
duplicates ownership or invents tool names.

## Routed reads (owner: mermail-manage-inbox)

- `search_emails` — find messages containing PR URLs. Pass `query` as a
  native JSON object, never a stringified object.
- `get_email` — exact safe reads of matched messages (`metadata_only` first,
  full read only for matches).

## Routed writes (owner: mermail-compose-email)

- `reply_to_email` — send the review reply in-thread. This is an
  external-effect tool: exact preview plus fresh user approval before sending.

## Non-MCP fetching

PR diffs come from the public GitHub REST API, not MCP tools:

- `GET /repos/{owner}/{repo}/pulls/{number}` — PR metadata.
- `GET /repos/{owner}/{repo}/pulls/{number}/files?per_page=100&page=N` —
  changed files with patches (paginate until a short page).

`references/pr_review.py` is a tested reference implementation of the fetch
plus the review checklist (verified against two live public PRs).
