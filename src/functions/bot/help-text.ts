export const helpText = `
\`\`\`markdown
# Touchie Bot Commands
## /ping
Replies with Pong!

## /split
Documents a split entry for a given member. Will provide the splittie with a confirmation code. To be used by the splitter.
Usage: \`/split @member amount\`
amount format: <number><unit> (e.g., 15m = 15 million)
Example: \`/split @nastycoder 12b\`

## /confirm
Confirms the split and updates the total split for the splitter.
Usage: \`/confirm code\`
Example: \`/confirm 123a\`

## /board
Displays the current split totals, does not include any splits that have not been confirmed.

## /help
Displays this help message.
\`\`\`
`;