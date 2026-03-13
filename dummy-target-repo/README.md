## Dummy Target Repo for SentinelQA

This is a **minimal dummy repository** you can push to GitHub and point the SentinelQA pipeline at. It contains:

- A **small, low-risk issue** that is easy for the Healer to fix.
- A **bigger, breaking issue** that should clearly fail tests and require a more substantial fix.

### Structure

- `src/small_issue.ts` — tiny cosmetic / logic issue.
- `src/big_issue.ts` — a more serious bug that should break behaviour.

You can initialise this as a git repo and push it:

```bash
cd dummy-target-repo
git init
git add .
git commit -m "chore: add dummy target repo"
git remote add origin https://github.com/<your-user>/dummy-target-repo.git
git push -u origin main
```

Then configure SentinelQA to use:

- **Owner**: `<your-user>`
- **Repo**: `dummy-target-repo`

