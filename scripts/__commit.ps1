Set-Location $PSScriptRoot\..
git add -A -- . ':(exclude)AGENTS.md' ':(exclude)CLAUDE.md' ':(exclude).vscode/tasks.json' ':(exclude)scripts/__run.ps1' ':(exclude)scripts/__check.ps1' ':(exclude)scripts/__gen.ps1' ':(exclude)scripts/__deploy.ps1' ':(exclude)scripts/__start.ps1' ':(exclude)scripts/__build.ps1'
git status --short
git commit -m "Merge origin/merged-final into main" -m "Brings in Eddie's roles and permissions, team management, contracts, stock inventory, office staff payroll, calculated site risk, live map page, guard login linking, SOS and per-guard metrics. Keeps the clientId-based client page and makes 0009 idempotent so it applies to the existing Neon database." -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git --no-pager log --oneline -3
