#!/bin/bash
# Bulk merge Dependabot PRs that have passing checks
# Usage: ./merge-dependabot-prs.sh [dry-run]

set -e

DRY_RUN=${1:-""}
REPO_OWNER=$(gh repo view --json owner -q .owner.login)
REPO_NAME=$(gh repo view --json name -q .name)

echo "🤖 Dependabot PR Merge Tool"
echo "Repository: $REPO_OWNER/$REPO_NAME"
echo ""

if [ "$DRY_RUN" == "dry-run" ]; then
  echo "🔍 DRY RUN MODE - No PRs will be merged"
  echo ""
fi

# Get all Dependabot PRs
PRS=$(gh pr list --author "app/dependabot" --json number,title,statusCheckRollup,mergeable,url --jq '.[]')

if [ -z "$PRS" ]; then
  echo "✅ No Dependabot PRs found!"
  exit 0
fi

MERGED_COUNT=0
FAILED_COUNT=0
SKIPPED_COUNT=0

echo "$PRS" | jq -c '.' | while read -r pr; do
  PR_NUMBER=$(echo "$pr" | jq -r '.number')
  PR_TITLE=$(echo "$pr" | jq -r '.title')
  PR_URL=$(echo "$pr" | jq -r '.url')
  MERGEABLE=$(echo "$pr" | jq -r '.mergeable')
  STATUS=$(echo "$pr" | jq -r '.statusCheckRollup[0].conclusion // "PENDING"')
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📦 PR #$PR_NUMBER: $PR_TITLE"
  echo "Status: $STATUS | Mergeable: $MERGEABLE"
  
  # Skip if checks are not passing
  if [ "$STATUS" != "SUCCESS" ]; then
    echo "⏭️  SKIPPED: Checks not passing ($STATUS)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    echo ""
    continue
  fi
  
  # Skip if not mergeable
  if [ "$MERGEABLE" != "MERGEABLE" ]; then
    echo "⏭️  SKIPPED: Not mergeable ($MERGEABLE)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    echo ""
    continue
  fi
  
  # Skip major version updates (require manual review)
  if echo "$PR_TITLE" | grep -qE "bump.*from [0-9]+\.[0-9]+\.[0-9]+ to [0-9]+\.[0-9]+\.[0-9]+"; then
    FROM_VERSION=$(echo "$PR_TITLE" | grep -oE "from ([0-9]+)\.([0-9]+)\.([0-9]+)" | awk '{print $2}')
    TO_VERSION=$(echo "$PR_TITLE" | grep -oE "to ([0-9]+)\.([0-9]+)\.([0-9]+)" | awk '{print $2}')
    
    FROM_MAJOR=$(echo "$FROM_VERSION" | cut -d. -f1)
    TO_MAJOR=$(echo "$TO_VERSION" | cut -d. -f1)
    
    if [ "$FROM_MAJOR" != "$TO_MAJOR" ]; then
      echo "⚠️  SKIPPED: Major version update ($FROM_VERSION → $TO_VERSION) - requires manual review"
      SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
      echo ""
      continue
    fi
  fi
  
  # Merge the PR
  if [ "$DRY_RUN" == "dry-run" ]; then
    echo "🔍 DRY RUN: Would merge PR #$PR_NUMBER"
    MERGED_COUNT=$((MERGED_COUNT + 1))
  else
    if gh pr merge "$PR_NUMBER" --squash --auto; then
      echo "✅ MERGED: PR #$PR_NUMBER"
      MERGED_COUNT=$((MERGED_COUNT + 1))
    else
      echo "❌ FAILED: Could not merge PR #$PR_NUMBER"
      FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
  fi
  
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Merged: $MERGED_COUNT"
echo "❌ Failed: $FAILED_COUNT"
echo "⏭️  Skipped: $SKIPPED_COUNT"
echo ""

if [ "$DRY_RUN" == "dry-run" ]; then
  echo "🔍 This was a DRY RUN - no PRs were actually merged"
  echo "Run without 'dry-run' argument to merge for real"
  echo ""
fi
