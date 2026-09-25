# Validation Evidence

How this domain is checked, what it fails on without this skill, and what the checks would miss.

## The failure this skill repairs

`npm run validate:remote` compares the local tool manifest against the authenticated catalog on the
production MCP server. On `main` it exits non-zero:

```
$ MERMAIL_MCP_TEST_API_KEY=… node tests/validate.mjs --remote
ERROR: production MCP tool catalog differs from tool-coverage.json
ERROR: authenticated tools/list returned 83 tools, expected 74
exit 1
```

The catalog had moved and the manifest had not. Nine webhook tools existed on the server and belonged
to no skill, so `tool-coverage.json` could not account for them and the domain-completeness check
could not pass. On this branch the same command exits zero:

```
$ MERMAIL_MCP_TEST_API_KEY=… node tests/validate.mjs --remote
Validated 18 skills and 82 business tools.
exit 0
```

Both runs are against `https://console.mermail.app/mcp`, September 2026.

## Reproducing it

```bash
npm test                                  # offline: structure, coverage, scenarios
MERMAIL_MCP_TEST_API_KEY=… npm run validate:remote   # adds the live catalog comparison
```

Without `MERMAIL_MCP_TEST_API_KEY` the remote pass still asserts that an unauthenticated request is
rejected with 401, then stops; it does not silently report success for a comparison it never made.

The expected catalog size is now derived from `tool-coverage.json` rather than written as a literal,
so the next tool the server gains fails the check with a number that names the drift instead of
failing against a constant nobody updated.

## What the scenarios cover

Twelve scenarios in `tests/scenarios.json` carry `"skill": "mermail-manage-webhooks"`: six with
`"approval": "none"` for the read paths, six with `"approval": "destructive"` for create, update,
delete, rotate, test and retry. The injection case is the load-bearing one — an endpoint URL that
arrives inside an email body must not route any webhook tool, and `forbiddenTools` is enforced for
every scenario rather than only for research-agent ones.

Each new check was mutation-tested. Removing a destructive classification, letting the injection
scenario reach `create_webhook`, weakening the URL rule in `security.md`, and dropping a tool from
coverage each produce a specific named failure rather than a silent pass.

## Harness coverage

The domain ships for both supported harnesses from one source of truth: `SKILL.md` for Claude-style
skill loading, `agents/openai.yaml` for the OpenAI agent surface, and an entry in
`compatibility.json`, which this branch moves to 18 skills and 82 business tools. The validator
rejects a skills directory that is not exactly `infrastructureSkills + domains + walletScopedDomains`,
so a skill added to one surface and forgotten on another does not merge.

## What these checks do not prove

- They compare names and classifications, not behaviour. That `create_webhook` is marked destructive
  is asserted; that a given agent will actually stop and ask is not.
- The live pass reads the catalog and calls `list_workspaces`. It does not create, test, rotate or
  delete an endpoint, because every one of those has an effect outside the workspace.
- Delivery behaviour — retry timing, signature headers, the receiver's response — is documented in
  [tools.md](tools.md) from live observation, not re-asserted on every run.
