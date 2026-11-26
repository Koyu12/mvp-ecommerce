#!/bin/bash
# PreToolUse hook: blocks destructive git commands from the Bash and PowerShell tools.
# Uses node to read the JSON input because jq is not installed on this machine.

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command??"")}catch{}})')

DANGEROUS_PATTERNS=(
  'git[[:space:]]+push.*[[:space:]](--force|--force-with-lease|-f)([[:space:]=]|$)'  # force push
  'git[[:space:]]+reset[[:space:]].*--hard'
  'git[[:space:]]+clean[[:space:]]+(-[[:alnum:]]*f|--force)'
  'git[[:space:]]+branch[[:space:]].*-D'
  'git[[:space:]]+checkout[[:space:]]+(--[[:space:]]+)?\.([[:space:]]|$)'
  'git[[:space:]]+restore[[:space:]]+(.*[[:space:]])?\.([[:space:]]|$)'
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qE -- "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '$pattern'. The user has prevented you from doing this." >&2
    exit 2
  fi
done

exit 0
