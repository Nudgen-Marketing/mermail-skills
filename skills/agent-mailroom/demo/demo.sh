#!/bin/bash
# Demo: Mermail Agent Skill — three-actor mailroom coordination over a REAL Mermail mailbox.
# Job: <JOB> — assigned by alice, claimed by bob, result posted back to the thread.
set -e
cd /tmp/mermail-demo
export MERMAIL_API_KEY="$(grep '^MERMAIL_API_KEY=' /Users/junkalwaysshine/broke-times/warpspeed-impl/.env | cut -d= -f2)"
MAILBOX="dsbroketimesagent@mermail.app"
JOB="${JOB:-job-201}"
TOPIC="audit-2026-10"

banner() { echo; echo "===== $1 ====="; sleep 4; }

banner "PROMPT (operator -> agent): Coordinate the audit job via the shared Mermail
mailbox: check the inbox, verify any mailroom envelopes, claim the job,
do the work, and post the result back to the thread."

banner "0. Mermail connect — resolve the shared mailbox (MCP list_mailboxes)"
python3 mcp_mail.py mailboxes

banner "1. Initialize the mailroom (allowlist + actors, lease 24h)"
python3 mailroom.py --state ./state init --mailbox "$MAILBOX" --actors alice,bob,carol \
  --sender "alice=$MAILBOX" --sender "bob=$MAILBOX" --sender "carol=$MAILBOX" \
  --lease-h 24

banner "2. Alice renders the assign envelope for bob"
python3 mailroom.py render --topic "$TOPIC" --to bob --from alice \
  --job "$JOB" --kind assign --lease-h 24 \
  --body "Measure the build time of the demo pipeline run. Report raw minutes and include the verification tag." \
  | tee /tmp/assign_env.txt

banner "3. Post the assign into the REAL Mermail inbox (MCP send_email)"
python3 mcp_mail.py send --subject "[mailroom][topic:$TOPIC][to:bob][job:$JOB][kind:assign]" \
  --body-file /tmp/assign_env.txt

banner "4. Bob polls the shared inbox (MCP search_emails), finds the assign"
sleep 3
python3 mcp_mail.py search --query "$TOPIC" --out search.txt
NEWEST=$(grep '^\- ' search.txt | head -1 | awk '{print $2}')

banner "5. Bob fetches the full message (MCP get_email) and ingests it"
echo "$NEWEST" > newest.txt
python3 mcp_mail.py get --subject "$(cat newest.txt)" --out inbox.json
python3 mailroom.py --state ./state ingest --as bob --mail inbox.json

banner "6. Bob claims $JOB (24h lease)"
python3 mailroom.py --state ./state claim --as bob --job "$JOB"

banner "7. Bob does the work and records the result"
python3 mailroom.py --state ./state result --as bob --job "$JOB" --status done \
  --body '{"status": "done"}' 

banner "8. Bob posts the result envelope back to the thread"
python3 mailroom.py render --topic "$TOPIC" --to alice --from bob \
  --job "$JOB" --kind result --status done \
  --body "Done: pipeline build time measured at 3m 41s raw; verification tag green." \
  | tee /tmp/result_env.txt
python3 mcp_mail.py send --subject "[mailroom][topic:$TOPIC][to:alice][job:$JOB][kind:result]" \
  --body-file /tmp/result_env.txt

banner "9. The job board (state)"
python3 mailroom.py --state ./state status

banner "10. Verify in the live Mermail inbox — both envelopes arrived"
sleep 3
python3 mcp_mail.py search --query "$TOPIC"

banner "11. The full journal (audit trail)"
cat state/journal.log

echo
echo "DEMO COMPLETE: assign -> claim -> result round-tripped through the real mailbox."
