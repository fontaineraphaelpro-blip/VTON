# Script to automatically commit and push changes to GitHub
param(
    [string]$Message = "Auto-commit: Update code"
)

Set-Location $PSScriptRoot

# Check if there are changes
$status = git status --porcelain
if (-not $status) {
    Write-Host "No changes to commit." -ForegroundColor Yellow
    exit 0
}

# Add all changes
git add -A

# Commit with message
git commit -m $Message

# Push to GitHub
git push origin main

Write-Host "Changes committed and pushed to GitHub successfully!" -ForegroundColor Green








