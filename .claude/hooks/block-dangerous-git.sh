#!/bin/bash
# PreToolUse hook: blocks destructive git commands from the Bash and PowerShell tools.
# Uses node to read the JSON input because jq is not installed on this machine.

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command??"")}catch{}})')

DANGEROUS_PATTERNS=(
  'git[[:space:]]+push.*[[:space:]](--force|--force-with-lease|-f)([[:space:]=]|$)'  # force push
  'git[[:space:]]+push.*[[:space:]+:](main|master)([[:space:]]|$)'                     # push to main
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

# A bare `git push` (or `git push origin HEAD`) from main pushes main without naming it.
if printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+push'; then
  BRANCH=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
    echo "BLOCKED: '$COMMAND' runs while on '$BRANCH'. Push from a feature branch instead. The user has prevented you from doing this." >&2
    exit 2
  fi
fi

exit 0
