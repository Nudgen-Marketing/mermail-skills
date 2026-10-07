# Minimal report schema

Provide an object with `reports` array. Each element requires unique `id` (the exact Mermail message ID in live use), `direction` (`lost` or `found`), `category` (short generic item class), `place` (coarse named site), and `date` (`YYYY-MM-DD` in the event's local timezone). Optional: `public_description` (non-secret generic text), `sensitive` (boolean, default false).

Do not include report bodies, names, addresses, contact details, serial numbers, contents, precise identifying marks, or a verification answer. Unknown date/place/category should be marked for staff instead of guessed. Dates are report event dates, not email sent dates unless the reporter explicitly says they coincide. Reports from multiple campuses/events must be separated before matching; a common place label across sites is not enough. Keep ID-to-person mapping only in the coordinator's Mermail account, never in a demo fixture or exported candidate table.
