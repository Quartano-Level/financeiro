#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Bump da versão do app (frontend + backend em LOCKSTEP) por semver derivado dos
    conventional-commits do delta da feature, mantendo o CHANGELOG.md (raiz).

.DESCRIPTION
    A versão do app vive em src/frontend/package.json e src/backend/package.json e é
    exibida na UI (badge/título via layout.tsx) e no /health do backend. Este script
    é chamado na fase Ship do pipeline (após Regis-Review + rebase, antes do PR) para
    que a versão suba a cada implementação sem depender de bump manual.

    Nível do bump (semver, pré-1.0):
      - algum commit `feat...:` (ou `!`/BREAKING CHANGE) no delta  → MINOR
      - senão algum commit `fix...:` ou `perf...:`                 → PATCH
      - senão (chore/docs/test/refactor/style/ci)                 → SEM BUMP (no-op)

    Lockstep: FE e BE terminam SEMPRE na mesma versão. Se divergirem na entrada,
    normaliza para a MAIOR antes de incrementar.

    Seguro por padrão: sem -Execute apenas mostra (dry-run) o que faria.
    NÃO cria git tag nem commita — a fase Ship do AutoLoopRunner faz o commit
    `chore(release): vX.Y.Z`. Tag/Release ficam para a CI (push na main).

.PARAMETER Base
    Ref base para calcular o delta de commits. Default: origin/main.

.PARAMETER Level
    Override manual do nível: minor | patch | none. Sem este parâmetro o nível é
    derivado dos commits de `<Base>..HEAD`.

.PARAMETER Date
    Data (yyyy-MM-dd) para a entrada do CHANGELOG. Default: hoje.

.PARAMETER Execute
    Aplica as mudanças (escreve package.json x2 + CHANGELOG.md). Sem este switch,
    apenas imprime o plano (dry-run).

.PARAMETER RepoRoot
    Raiz do repositório. Default: resolvida via `git rev-parse --show-toplevel`.

.EXAMPLE
    pwsh scripts/bump-version.ps1
    Dry-run: mostra o nível detectado e a versão resultante, sem alterar nada.

.EXAMPLE
    pwsh scripts/bump-version.ps1 -Execute
    Aplica o bump derivado dos commits desde origin/main.

.EXAMPLE
    pwsh scripts/bump-version.ps1 -Level patch -Execute
    Força um bump de patch (ex.: chore(release) de reconciliação).
#>
[CmdletBinding()]
param(
    [string]$Base = 'origin/main',
    [ValidateSet('minor', 'patch', 'none')]
    [string]$Level,
    [string]$Date,
    [switch]$Execute,
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    $out = & git @Args 2>&1
    return ($out | Out-String).Trim()
}

# --- semver helpers (pré-1.0: feat → minor, fix/perf → patch) ---------------
function ConvertTo-SemVer {
    param([string]$V)
    $m = [regex]::Match($V, '^(\d+)\.(\d+)\.(\d+)')
    if (-not $m.Success) { throw "Versão inválida: '$V'" }
    return [pscustomobject]@{
        Major = [int]$m.Groups[1].Value
        Minor = [int]$m.Groups[2].Value
        Patch = [int]$m.Groups[3].Value
    }
}
function Compare-SemVer {
    param($A, $B) # retorna -1, 0, 1
    foreach ($k in 'Major', 'Minor', 'Patch') {
        if ($A.$k -lt $B.$k) { return -1 }
        if ($A.$k -gt $B.$k) { return 1 }
    }
    return 0
}
function Step-SemVer {
    param($S, [string]$Lvl)
    switch ($Lvl) {
        'minor' { return "$($S.Major).$($S.Minor + 1).0" }
        'patch' { return "$($S.Major).$($S.Minor).$($S.Patch + 1)" }
        default { return "$($S.Major).$($S.Minor).$($S.Patch)" }
    }
}

# --- package.json version read/write (preserva formatação/indentação) -------
function Get-PkgVersion {
    param([string]$Path)
    $txt = Get-Content -LiteralPath $Path -Raw
    $m = [regex]::Match($txt, '"version"\s*:\s*"([^"]+)"')
    if (-not $m.Success) { throw "Campo 'version' não encontrado em $Path" }
    return $m.Groups[1].Value
}
function Set-PkgVersion {
    param([string]$Path, [string]$New)
    $txt = Get-Content -LiteralPath $Path -Raw
    $rx = [regex]::new('("version"\s*:\s*")[^"]*(")')
    $out = $rx.Replace($txt, "`${1}$New`${2}", 1)
    Set-Content -LiteralPath $Path -Value $out -NoNewline
}

# --- resolve repo root ------------------------------------------------------
if (-not $RepoRoot) { $RepoRoot = Invoke-Git rev-parse --show-toplevel }
if (-not $RepoRoot -or -not (Test-Path $RepoRoot)) {
    Write-Error 'Não foi possível resolver a raiz do repositório. Rode dentro do repo ou passe -RepoRoot.'
    exit 1
}
Set-Location $RepoRoot

$fePkg = Join-Path $RepoRoot 'src/frontend/package.json'
$bePkg = Join-Path $RepoRoot 'src/backend/package.json'
$changelog = Join-Path $RepoRoot 'CHANGELOG.md'
if (-not $Date) { $Date = (Get-Date -Format 'yyyy-MM-dd') }

$mode = if ($Execute) { 'EXECUTE' } else { 'DRY-RUN' }
Write-Host ''
Write-Host "=== bump-version ($mode) ===" -ForegroundColor Cyan

# --- versão base (lockstep: maior das duas) ---------------------------------
$feV = Get-PkgVersion $fePkg
$beV = Get-PkgVersion $bePkg
$feS = ConvertTo-SemVer $feV
$beS = ConvertTo-SemVer $beV
$baseS = if ((Compare-SemVer $feS $beS) -ge 0) { $feS } else { $beS }
$baseV = "$($baseS.Major).$($baseS.Minor).$($baseS.Patch)"
if ($feV -ne $beV) {
    Write-Host "FE=$feV BE=$beV divergem — normalizando para a maior: $baseV" -ForegroundColor Yellow
}

# --- nível do bump ----------------------------------------------------------
$subjects = @()
if (-not $Level) {
    $log = Invoke-Git log --format=%s "$Base..HEAD"
    $subjects = if ($log) { $log -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ } } else { @() }
    $hasFeat = [bool]($subjects | Where-Object { $_ -match '^feat(\(.+\))?!?:' -or $_ -match 'BREAKING CHANGE' })
    $hasFix = [bool]($subjects | Where-Object { $_ -match '^(fix|perf)(\(.+\))?!?:' })
    $Level = if ($hasFeat) { 'minor' } elseif ($hasFix) { 'patch' } else { 'none' }
    Write-Host "Delta $Base..HEAD: $($subjects.Count) commit(s) → nível detectado: $Level" -ForegroundColor DarkGray
} else {
    Write-Host "Nível forçado via -Level: $Level" -ForegroundColor DarkGray
}

if ($Level -eq 'none') {
    Write-Host "Sem feat/fix/perf no delta — NENHUM bump. Versão permanece $baseV." -ForegroundColor Yellow
    Write-Host ''
    exit 0
}

$newV = Step-SemVer $baseS $Level
Write-Host "Bump: $baseV → $newV ($Level, lockstep FE+BE)" -ForegroundColor Green

# --- changelog entry --------------------------------------------------------
$relevant = $subjects | Where-Object { $_ -match '^(feat|fix|perf)(\(.+\))?!?:' }
$entryLines = @("## v$newV ($Date)", '')
if ($relevant -and $relevant.Count -gt 0) {
    foreach ($s in $relevant) { $entryLines += "- $s" }
} else {
    $entryLines += "- (bump $Level — ver histórico de commits)"
}
$entryLines += ''
$entry = ($entryLines -join "`n")

if (-not $Execute) {
    Write-Host ''
    Write-Host '--- (dry-run) entrada de CHANGELOG.md ---' -ForegroundColor DarkGray
    Write-Host $entry
    Write-Host "(dry-run — rode com -Execute para aplicar em $fePkg, $bePkg e CHANGELOG.md)" -ForegroundColor Yellow
    Write-Host ''
    exit 0
}

# --- aplica -----------------------------------------------------------------
Set-PkgVersion $fePkg $newV
Set-PkgVersion $bePkg $newV

$header = '# Columbia Financeiro — Changelog'
if (Test-Path $changelog) {
    $cur = Get-Content -LiteralPath $changelog -Raw
    if ($cur -match [regex]::Escape($header)) {
        # insere a nova entrada logo após a linha do header
        $idx = $cur.IndexOf($header) + $header.Length
        $rest = $cur.Substring($idx).TrimStart("`r", "`n")
        $new = "$header`n`n$entry`n$rest"
    } else {
        $new = "$header`n`n$entry`n$cur"
    }
} else {
    $new = "$header`n`n$entry"
}
Set-Content -LiteralPath $changelog -Value $new

Write-Host ''
Write-Host "Aplicado: FE+BE → v$newV; CHANGELOG.md atualizado." -ForegroundColor Green
Write-Host 'Próximo passo (pipeline): commitar como chore(release): v' -NoNewline; Write-Host $newV
Write-Host ''
