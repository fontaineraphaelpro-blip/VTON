# Script PowerShell pour commit + push automatique
param(
    [string]$Message = "Auto-commit: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

cd $PSScriptRoot

Write-Host "Ajout des fichiers..." -ForegroundColor Cyan
git add .

Write-Host "Commit..." -ForegroundColor Cyan
git commit -m $Message

Write-Host "Push vers GitHub..." -ForegroundColor Cyan
git push origin main

Write-Host "`n✅ Termine!" -ForegroundColor Green

