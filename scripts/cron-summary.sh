#!/bin/bash
# WhatsApp daily summary cron script
# Crontab entry: 0 9 * * * /path/to/whatsapp-mcp/scripts/cron-summary.sh

OUTPUT_DIR="$HOME/whatsapp-summaries"
mkdir -p "$OUTPUT_DIR"

DATE=$(date +%Y-%m-%d)

claude -p "Using whatsapp tools: list_groups, then for each active group fetch_messages since=24h and get_group_stats since=24h. Summarize: key topics, action items, notable links, top contributors, activity stats." \
  --output-format text \
  > "$OUTPUT_DIR/$DATE.md" 2>> "$OUTPUT_DIR/cron.log"
