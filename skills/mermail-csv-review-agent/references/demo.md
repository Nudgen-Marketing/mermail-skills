# Reproducible example

The bundled inventory is synthetic. Its addresses are examples, not destinations to contact. From the repository root, run:

```sh
python skills/mermail-csv-review-agent/scripts/review_csv.py --input skills/mermail-csv-review-agent/assets/demo-inventory.csv --rules skills/mermail-csv-review-agent/assets/demo-rules.json --out /tmp/mermail-csv-review-demo
```

Choose a new writable output directory on your OS. Expected: 10 input records, 4 candidates, 6 held, `needs_review`. Both records for `004` are held. IDs retain leading zeros. The accepted `001` name is trimmed to `Camera`. Missing name, unsupported status, formula-like text and extra field are separately reported.

The automated helper checks run with `python -m unittest discover -s tests -p test_csv_review.py`. These are offline checks, not a live Mermail demonstration.

## Live demonstration

Use a dedicated test mailbox with receiving ready and sufficient free API credits. Send the synthetic CSV as an attachment from an owner-approved test sender to that mailbox; use no private historical email. Do not enable wallet functionality or purchase credits for the demo.

Trigger with this owner prompt, replacing the selected IDs and intended draft recipient with actual values:

> Use $mermail-csv-review-agent on the inventory CSV attached to this selected email. Use the bundled demo rules that I have reviewed, save the local outputs, and draft the review summary to my specified test recipient. Send nothing.

Show the real client resolving the mailbox, reading the selected message and attachment, running the helper, and saving an actual unsent draft. The final summary must say that 6 records remain held; the 4 candidates are not a fully cleaned input. Show the attachment/message IDs and the source hash, keeping credentials and unrelated email out of the recording.

For the bounty's 2–5 minute English video, show the triggering prompt, actual Mermail tool results, local candidates and exceptions, and the returned draft visible in the console. A scripted simulation, mock inbox, slides or source-code walkthrough does not satisfy that requirement. Record the real run only after login and connection are available.
