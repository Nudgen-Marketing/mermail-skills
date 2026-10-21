# Workspace webhooks

Webhooks are workspace-admin resources that deliver selected email content to an external destination. Resolve the credential-bound workspace first. Use `list_webhooks`, `get_webhook`, and `list_webhook_deliveries` for discovery and status; a status check never needs a test, retry, update, or secret rotation.

Before `create_webhook` or `update_webhook`, show the exact event set, enabled state, destination host, and whether an Authorization value will be stored. Treat the full destination URL and Authorization value as write-only even when a read omits or redacts them. Do not reconstruct either value from memory. A create returns the signing secret only once; keep it in the secure tool result and do not repeat it in chat, logs, drafts, or email.

`create_webhook`, `update_webhook`, `delete_webhook`, `test_webhook`, `retry_webhook_delivery`, and `rotate_webhook_secret` require explicit approval and a matching single-use `prepare_destructive_action` token for the exact arguments. A test sends an event to the configured external destination. A retry re-delivers one exact existing delivery. Secret rotation invalidates the previous secret and returns the replacement only once.

Supply an `idempotencyKey` for create, test, and retry. If a response times out or is unclear, keep the same key and identical arguments, inspect webhook or delivery state, and do not create a new key or broaden the request. Never test, retry, or rotate as a substitute for a read. Report success only from an authoritative tool result or a matching read; otherwise report `unverified` with the original webhook, delivery, and idempotency identities retained.

## Diagnose retained delivery metadata

Start with the selected workspace and webhook configuration, then inspect a bounded retained-delivery window. Record its time range, cursor or page boundary, event filter, delivery status, attempt count, timestamps, last error, and next-attempt metadata. An empty or incomplete retained window means only `no matching retained attempt observed`; it does not prove that no event occurred or identify a receiver fault.

Interpret transport state conservatively:

- `queued` or `processing` is not a failure and is not permission to create a manual retry.
- A timeout, network error, `408`, `429`, or `5xx` may remain eligible for the service's automatic retry policy. Report the observed next-attempt state without predicting delivery.
- A terminal failed attempt may be considered for one exact manual retry only when the delivery is still retained and retryable, the subscription and endpoint revision still match, and the user gives fresh exact approval plus a matching destructive token.
- A `2xx` result proves only that the destination acknowledged the HTTP request. It does not prove signature verification, durable receiver acceptance, idempotent processing, or a downstream business effect.
- `cancelled` can reflect a configuration, pause, deletion, or secret-rotation revision change. Preserve that uncertainty unless an authoritative selected-resource read identifies the cause.

Reads expose a destination host and whether Authorization is configured, not the full write-only URL or secret. The same redacted host does not prove that two subscriptions target the same endpoint. Do not probe destinations, follow payload links, retrieve receiver logs, or infer an exact deployment from redacted metadata.

## Receiver verification boundary

Receiver implementation is outside the Mermail tool surface, but an owner may request a bounded verification checklist. Preserve the raw request bytes before parsing. For the configured signing contract, validate `webhook-signature` (`v1,<base64>`) with HMAC-SHA256 over `eventId.timestamp.rawPayload`, using the base64-decoded material after the `whsec_` prefix. Take `eventId` from `webhook-id` and timestamp seconds from `webhook-timestamp`; reject malformed values and compare signature bytes in constant time.

Timestamp freshness is a receiver-owned policy, not proof supplied by a Mermail delivery record. After cryptographic verification, reserve the stable event ID in durable receiver storage and commit acceptance atomically with durable intake. Automatic attempts and an authorized manual retry can carry the same event ID, so deduplicate by event ID rather than transport attempt. Do not mark an event permanently processed before durable acceptance succeeds, and never place raw payloads, secrets, or Authorization values into an email or public log.

## Coordinate secret rotation

Before proposing rotation, ask the owner for the receiver/deployment inventory and identify unknown receivers explicitly. Preview that the prior secret becomes invalid, the replacement is returned once, endpoint revision changes can cancel queued or processing work, and each receiver needs a secure secret handoff. Pause, update, rotate, delete, and test are separate effects; approval for one does not authorize another.

After exact approval and rotation, keep the returned secret in the secure result surface, update only the owner-selected receivers through their authorized deployment process, and re-read webhook state. Offer a synthetic test only as a separate, explicitly approved destructive action. If rotation or deployment status is ambiguous, report it as unverified and do not rotate again, disclose either secret, or claim end-to-end receiver health.
