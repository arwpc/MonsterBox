# MonsterBox Remote Agent Monitoring Script
# Monitor progress of Augment Code remote agents

Write-Host "🎃 MonsterBox Remote Agent Progress Monitor" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

# Check Git status for all feature branches
Write-Host "`n📊 Checking branch status..." -ForegroundColor Yellow

$branches = @(
    "feature/secure-remote-access-system",
    "feature/comprehensive-testing-suite", 
    "feature/enhanced-mcp-log-collection"
)

foreach ($branch in $branches) {
    Write-Host "`n🔍 Branch: $branch" -ForegroundColor Cyan
    
    # Fetch latest changes
    git fetch origin $branch 2>$null
    
    # Check if branch exists remotely
    $remoteBranch = git ls-remote --heads origin $branch 2>$null
    if ($remoteBranch) {
        # Get latest commits
        $commits = git log origin/$branch --oneline -5 2>$null
        if ($commits) {
            Write-Host "   Latest commits:" -ForegroundColor White
            $commits | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
        } else {
            Write-Host "   No commits found" -ForegroundColor Red
        }
    } else {
        Write-Host "   Branch not found on remote" -ForegroundColor Red
    }
}

# Check Task Master status
Write-Host "`n📋 Task Master Status..." -ForegroundColor Yellow
try {
    $taskStatus = task-master-ai get-tasks --project-root "C:\Users\arwpe\CodeBase\MonsterBox-1" --status "in-progress" 2>$null
    if ($taskStatus) {
        Write-Host "   Active tasks found" -ForegroundColor Green
    } else {
        Write-Host "   No active tasks" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   Task Master not available" -ForegroundColor Red
}

Write-Host "`n✅ Monitoring complete!" -ForegroundColor Green
