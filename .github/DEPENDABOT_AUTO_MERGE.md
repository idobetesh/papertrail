# Dependabot Auto-Merge Setup

This repository is configured to automatically merge safe Dependabot PRs.

## 🚀 Quick Start (No GitHub CLI Required)

### View Dependabot PRs
```bash
# Set your GitHub token
export GITHUB_TOKEN=your_token_here

# List all Dependabot PRs and their status
make list-dependabot
```

**What you'll see:**
- ✅ Safe to auto-merge (patch/minor with passing tests)
- ⚠️ Needs review (major updates)
- ❌ Failing checks
- ⏳ Checks pending

**Get a GitHub token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scope: `repo`
4. Copy the token and set: `export GITHUB_TOKEN=ghp_...`

---

## 🤖 How It Works

### Automatic (GitHub Actions)
The `.github/workflows/dependabot-auto-merge.yml` workflow automatically:

1. ✅ **Waits for all CI checks to pass** (lint, tests, build)
2. ✅ **Auto-merges patch updates** (e.g., `1.0.0` → `1.0.1`)
3. ✅ **Auto-merges minor updates** (e.g., `1.0.0` → `1.1.0`)
4. ⚠️ **Requires manual review for major updates** (e.g., `1.0.0` → `2.0.0`)

**Requirements:**
- All CI checks must pass (enforced by your test suite)
- PR must be from Dependabot
- Update type must be patch or minor

### Manual (Bulk Merge Script)
For existing PRs or manual control, use the merge script:

**Requires GitHub CLI (`gh`):**
```bash
# Preview what would be merged (dry run)
.github/scripts/merge-dependabot-prs.sh dry-run

# Actually merge passing PRs
.github/scripts/merge-dependabot-prs.sh

# Or use the Makefile
make merge-dependabot
```

**Don't have GitHub CLI?** Use `make list-dependabot` to see which PRs are safe to merge, then merge them manually in GitHub UI.

**The script:**
- ✅ Only merges PRs with passing checks
- ✅ Skips major version updates
- ✅ Skips non-mergeable PRs (conflicts, failed checks)
- ✅ Shows detailed summary

## 🛡️ Safety Features

### Your Test Suite Protects You
Before any PR is merged (auto or manual), it must pass:
- **Pre-commit**: ESLint + Prettier + TypeScript compilation
- **CI Tests**: All unit and integration tests
- **Type checking**: Full TypeScript validation

If tests fail, the PR **will not be merged**.

### Version Update Rules
| Update Type | Example | Action |
|-------------|---------|--------|
| Patch | `1.0.0` → `1.0.1` | ✅ Auto-merge |
| Minor | `1.0.0` → `1.1.0` | ✅ Auto-merge |
| Major | `1.0.0` → `2.0.0` | ⚠️ Manual review required |

## 📋 Managing Existing PRs

### View all Dependabot PRs

**Without GitHub CLI (just curl + jq):**
```bash
# Set your token
export GITHUB_TOKEN=your_token_here

# List with status
make list-dependabot

# Or run the script directly
.github/scripts/list-dependabot-prs.sh
```

**With GitHub CLI:**
```bash
gh pr list --author "app/dependabot"
```

### Close outdated PRs
```bash
# Close superseded PRs
gh pr list --author "app/dependabot" --json number,title | \
  jq -r '.[] | select(.title | contains("bump")) | .number' | \
  xargs -I {} gh pr close {}
```

### Merge all passing PRs at once
```bash
# Dry run first
.github/scripts/merge-dependabot-prs.sh dry-run

# Then merge for real
.github/scripts/merge-dependabot-prs.sh
```

## ⚙️ Configuration

### Dependabot Settings (`dependabot.yml`)
Current configuration:
- **Frequency**: Weekly (Mondays at 9:00 AM)
- **Max Open PRs**: 5 per ecosystem
- **Grouping**: Patch and minor updates are grouped
- **Commit Format**: Conventional commits (`chore(scope): ...`)

### Auto-Merge Workflow
Located at: `.github/workflows/dependabot-auto-merge.yml`

**Permissions required:**
- `contents: write` - To merge PRs
- `pull-requests: write` - To approve and comment on PRs

## 🚀 First-Time Setup

1. **Enable auto-merge in repository settings:**
   - Go to Settings → General → Pull Requests
   - ✅ Check "Allow auto-merge"

2. **Ensure branch protection is configured:**
   - Go to Settings → Branches → Branch protection rules
   - ✅ Require status checks to pass before merging
   - ✅ Add your CI workflow as a required check

3. **Test with existing PRs:**
   ```bash
   # See what would happen
   .github/scripts/merge-dependabot-prs.sh dry-run
   
   # Merge passing PRs
   .github/scripts/merge-dependabot-prs.sh
   ```

## 🔍 Monitoring

### View auto-merge activity
```bash
gh run list --workflow=dependabot-auto-merge.yml
```

### Check which PRs were auto-merged
```bash
gh pr list --state merged --author "app/dependabot" --limit 20
```

## 🛠️ Troubleshooting

### Auto-merge not working?
1. Check that "Allow auto-merge" is enabled in repo settings
2. Verify all CI checks are passing
3. Ensure the PR is from Dependabot
4. Check GitHub Actions logs: `gh run list --workflow=dependabot-auto-merge.yml`

### Too many PRs?
Reduce `open-pull-requests-limit` in `dependabot.yml`:
```yaml
open-pull-requests-limit: 3  # Default is 5
```

### Want to disable auto-merge temporarily?
Comment on the PR:
```
@dependabot ignore
```

## 📚 Resources

- [Dependabot Documentation](https://docs.github.com/en/code-security/dependabot)
- [Auto-merge Documentation](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request)
- [Dependabot Fetch Metadata Action](https://github.com/dependabot/fetch-metadata)
