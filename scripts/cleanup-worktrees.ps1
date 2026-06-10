#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Limpa worktrees git já concluídos (PR mergeado) e branches stale, liberando o disco
    ocupado por seus node_modules.

.DESCRIPTION
    O fluxo do repositório usa gitflow via worktrees (cada feature/wave num worktree em
    C:/tmp/<nome>). Cada worktree carrega ~600 MB de node_modules instalados manualmente.
    Worktrees NÃO duplicam o .git (compartilham o object store do repo principal), então
    o custo real é a working tree + node_modules. Este script remove com segurança os
    worktrees cujo trabalho já foi integrado, e opcionalmente as branches locais stale.

    Seguro por padrão: sem -Execute apenas mostra (dry-run) o que faria.
    NUNCA remove o worktree principal, o worktree da branch `main`, nem worktrees de
    branches com PR ABERTO. Worktrees com mudanças não commitadas são preservados
    (a menos que -Force).

.PARAMETER Execute
    Aplica as ações. Sem este switch, o script só imprime o plano (dry-run).

.PARAMETER Force
    Permite remover worktree com working tree sujo (git worktree remove --force) e
    deletar branches não totalmente mergeadas (git branch -D).

.PARAMETER DeleteBranches
    Também deleta branches locais stale (PR mergeado / upstream gone / branches órfãs worktree-*).

.PARAMETER Fetch
    Roda `git fetch --prune` antes de avaliar (atualiza o estado de upstream "gone").

.PARAMETER Keep
    Lista de worktrees a preservar explicitamente, mesmo que elegíveis para remoção
    (ex.: PR já mergeado mas você ainda trabalha nele). Casa por nome da pasta, nome da
    branch, ou caminho completo. A branch de um worktree preservado também é mantida.

.PARAMETER RepoRoot
    Raiz do repositório. Default: resolvida via `git rev-parse --show-toplevel`.

.EXAMPLE
    pwsh scripts/cleanup-worktrees.ps1
    Preview: lista worktrees e o que seria removido, sem alterar nada.

.EXAMPLE
    pwsh scripts/cleanup-worktrees.ps1 -Execute -DeleteBranches
    Remove worktrees concluídos e branches stale.

.EXAMPLE
    pwsh scripts/cleanup-worktrees.ps1 -Execute -Force -DeleteBranches -Fetch
    Limpeza completa, incluindo worktrees sujos e branches não totalmente mergeadas.
#>
[CmdletBinding()]
param(
    [switch]$Execute,
    [switch]$Force,
    [switch]$DeleteBranches,
    [switch]$Fetch,
    [string[]]$Keep = @(),
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    $out = & git @Args 2>&1
    return ($out | Out-String).Trim()
}

function Get-FolderSizeMB {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return 0 }
    try {
        $bytes = (Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum).Sum
        if (-not $bytes) { return 0 }
        return [math]::Round($bytes / 1MB, 0)
    } catch { return 0 }
}

# Resolve repo root
if (-not $RepoRoot) {
    $RepoRoot = Invoke-Git rev-parse --show-toplevel
}
if (-not $RepoRoot -or -not (Test-Path $RepoRoot)) {
    Write-Error "Não foi possível resolver a raiz do repositório. Rode dentro do repo ou passe -RepoRoot."
    exit 1
}
Set-Location $RepoRoot
$mainWorktreePath = (Resolve-Path $RepoRoot).Path

$hasGh = [bool](Get-Command gh -ErrorAction SilentlyContinue)

$mode = if ($Execute) { 'EXECUTE' } else { 'DRY-RUN' }
Write-Host ""
Write-Host "=== cleanup-worktrees ($mode) ===" -ForegroundColor Cyan
Write-Host "Repo: $mainWorktreePath"
Write-Host "gh CLI: $(if ($hasGh) { 'disponível' } else { 'ausente — usando heurística git' })"
if (-not $Execute) {
    Write-Host "(dry-run — nada será alterado; use -Execute para aplicar)" -ForegroundColor Yellow
}
Write-Host ""

if ($Fetch) {
    Write-Host "Fetch --prune..." -ForegroundColor DarkGray
    if ($Execute) { [void](Invoke-Git fetch --prune) } else { Write-Host "  (dry-run) git fetch --prune" -ForegroundColor DarkGray }
}

# ---------------------------------------------------------------------------
# Branch classification helpers
# ---------------------------------------------------------------------------
function Test-OpenPr {
    param([string]$Branch)
    if (-not $hasGh) { return $false }
    try {
        $json = & gh pr list --head $Branch --state open --json number 2>$null | Out-String
        return ($json.Trim() -and $json -notmatch '^\s*\[\s*\]\s*$')
    } catch { return $false }
}

function Get-OpenPrNumber {
    param([string]$Branch)
    if (-not $hasGh) { return $null }
    try {
        $n = & gh pr list --head $Branch --state open --json number --jq '.[0].number' 2>$null | Out-String
        $n = $n.Trim()
        if ($n) { return $n } else { return $null }
    } catch { return $null }
}

function Test-BranchMerged {
    param([string]$Branch)
    # 1) PR mergeado?
    if ($hasGh) {
        try {
            $json = & gh pr list --head $Branch --state merged --json number 2>$null | Out-String
            if ($json.Trim() -and $json -notmatch '^\s*\[\s*\]\s*$') { return $true }
        } catch {}
    }
    # 2) Nada à frente de origin/main (squash-merge cobre conteúdo)?
    $ahead = Invoke-Git rev-list --count "origin/main..$Branch"
    if ($ahead -eq '0') { return $true }
    return $false
}

function Test-UpstreamGone {
    param([string]$Branch)
    $line = Invoke-Git for-each-ref --format='%(upstream:track)' "refs/heads/$Branch"
    return ($line -match '\[gone\]' -or $line -match 'gone')
}

# ---------------------------------------------------------------------------
# 1) Enumera worktrees
# ---------------------------------------------------------------------------
$porcelain = Invoke-Git worktree list --porcelain
$worktrees = @()
$cur = $null
foreach ($line in ($porcelain -split "`n")) {
    $line = $line.TrimEnd("`r")
    if ($line -like 'worktree *') {
        if ($cur) { $worktrees += $cur }
        $cur = [ordered]@{ Path = $line.Substring(9); Branch = $null; Bare = $false; Detached = $false }
    } elseif ($line -like 'branch *') {
        $cur.Branch = ($line.Substring(7) -replace '^refs/heads/', '')
    } elseif ($line -eq 'bare') {
        $cur.Bare = $true
    } elseif ($line -eq 'detached') {
        $cur.Detached = $true
    }
}
if ($cur) { $worktrees += $cur }

function Format-WtPath {
    param([string]$Path)
    if ($Path -eq $mainWorktreePath) { return '(repo principal)' }
    return $Path
}

$results = @()
$totalFreed = 0

foreach ($wt in $worktrees) {
    $path = (Resolve-Path $wt.Path -ErrorAction SilentlyContinue).Path
    if (-not $path) { $path = $wt.Path }
    $branch = $wt.Branch
    $isMain = ($path -eq $mainWorktreePath)

    # Skip principal e main
    if ($isMain -or $wt.Bare -or $branch -eq 'main' -or -not $branch) {
        $results += [pscustomobject]@{ Worktree = (Format-WtPath $path); Branch = ($branch ?? '(detached)'); State = 'KEEP (principal/main)'; FreedMB = 0 }
        continue
    }

    # Preservação explícita via -Keep (casa por branch, nome da pasta ou caminho)
    $leaf = Split-Path $path -Leaf
    if ($Keep -and ($Keep -contains $branch -or $Keep -contains $leaf -or $Keep -contains $path)) {
        $results += [pscustomobject]@{ Worktree = (Format-WtPath $path); Branch = $branch; State = 'KEEP (-Keep)'; FreedMB = 0 }
        continue
    }

    # PR aberto → preservar sempre
    $openPr = Get-OpenPrNumber $branch
    if ($openPr) {
        $results += [pscustomobject]@{ Worktree = (Format-WtPath $path); Branch = $branch; State = "KEEP (PR #$openPr aberto)"; FreedMB = 0 }
        continue
    }

    # Dirty?
    $dirty = [bool](Invoke-Git -C $path status --porcelain)
    if ($dirty -and -not $Force) {
        $results += [pscustomobject]@{ Worktree = (Format-WtPath $path); Branch = $branch; State = 'SKIP (dirty — use -Force)'; FreedMB = 0 }
        continue
    }

    # Concluído?
    $merged = Test-BranchMerged $branch
    if (-not $merged -and -not $Force) {
        $results += [pscustomobject]@{ Worktree = (Format-WtPath $path); Branch = $branch; State = 'SKIP (não mergeado — use -Force)'; FreedMB = 0 }
        continue
    }

    # → Remover
    $sizeMB = Get-FolderSizeMB $path
    if ($Execute) {
        $removeArgs = @('worktree', 'remove', $path)
        if ($Force) { $removeArgs += '--force' }
        [void](Invoke-Git @removeArgs)
        $state = 'REMOVED'
    } else {
        $state = 'WOULD REMOVE'
    }
    $totalFreed += $sizeMB
    $results += [pscustomobject]@{ Worktree = (Format-WtPath $path); Branch = $branch; State = $state; FreedMB = $sizeMB }
}

# ---------------------------------------------------------------------------
# 2) Prune metadados órfãos
# ---------------------------------------------------------------------------
if ($Execute) {
    $pruned = Invoke-Git worktree prune -v
    if ($pruned) { Write-Host "prune: $pruned" -ForegroundColor DarkGray }
} else {
    $pruned = Invoke-Git worktree prune --dry-run -v
    if ($pruned) { Write-Host "(dry-run) prune removeria: $pruned" -ForegroundColor DarkGray }
}

# ---------------------------------------------------------------------------
# 3) Tabela de worktrees
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Worktrees ---" -ForegroundColor Cyan
$results | Format-Table -Wrap -AutoSize Worktree, Branch, State, FreedMB | Out-String -Width 200 | Write-Host

# ---------------------------------------------------------------------------
# 4) Branches stale (opcional)
# ---------------------------------------------------------------------------
if ($DeleteBranches) {
    Write-Host "--- Branches locais stale ---" -ForegroundColor Cyan

    # Branches ainda em uso por worktrees restantes (não deletar)
    $inUse = @{}
    foreach ($line in ((Invoke-Git worktree list --porcelain) -split "`n")) {
        if ($line -like 'branch *') { $inUse[($line.Substring(7) -replace '^refs/heads/', '').Trim()] = $true }
    }

    $allBranches = (Invoke-Git for-each-ref --format='%(refname:short)' refs/heads) -split "`n" |
        ForEach-Object { $_.Trim() } | Where-Object { $_ }

    $branchResults = @()
    foreach ($b in $allBranches) {
        if ($b -eq 'main') { continue }
        if ($inUse.ContainsKey($b)) {
            $branchResults += [pscustomobject]@{ Branch = $b; State = 'KEEP (worktree ativo)' }
            continue
        }
        if (Test-OpenPr $b) {
            $branchResults += [pscustomobject]@{ Branch = $b; State = 'KEEP (PR aberto)' }
            continue
        }

        $merged = Test-BranchMerged $b
        $gone = Test-UpstreamGone $b
        $isOrphanWorktree = ($b -like 'worktree-*')

        if ($merged -or $gone -or ($isOrphanWorktree -and $Force)) {
            if ($Execute) {
                $delFlag = if ($Force) { '-D' } else { '-d' }
                $del = Invoke-Git branch $delFlag $b
                $state = if ($del -match 'not fully merged|error|fatal') { "SKIP ($del) — use -Force" } else { 'DELETED' }
            } else {
                $state = 'WOULD DELETE'
            }
            $branchResults += [pscustomobject]@{ Branch = $b; State = $state }
        } else {
            $reason = if ($isOrphanWorktree) { 'órfã worktree-* (use -Force)' } else { 'não mergeada' }
            $branchResults += [pscustomobject]@{ Branch = $b; State = "SKIP ($reason)" }
        }
    }
    $branchResults | Format-Table -Wrap -AutoSize Branch, State | Out-String -Width 200 | Write-Host
}

# ---------------------------------------------------------------------------
# Resumo
# ---------------------------------------------------------------------------
Write-Host "=== Resumo ===" -ForegroundColor Cyan
if ($Execute) {
    Write-Host ("Disco liberado: ~{0} MB" -f $totalFreed) -ForegroundColor Green
} else {
    Write-Host ("Disco liberável: ~{0} MB (dry-run — rode com -Execute para aplicar)" -f $totalFreed) -ForegroundColor Yellow
}
Write-Host ""
