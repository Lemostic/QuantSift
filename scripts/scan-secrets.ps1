<#
  scan-secrets.ps1 - secret scan gate before commits and builds (dead rule).

  Modes:
    - default: scan git staged files only (pre-commit).
    - -All:    scan the whole working tree (excludes node_modules/target/dist).
    - -Staged is an explicit alias of the default.

  Exits non-zero when any secret pattern is found.
#>
[CmdletBinding()]
param(
    [switch]$All,
    [switch]$Staged
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

# Common secret patterns: LLM/search API keys, GitHub tokens, cloud keys, private keys, Bearer tokens.
$patterns = @(
    'sk-[A-Za-z0-9_-]{16,}',
    'tvly-[A-Za-z0-9_-]{16,}',
    'Bearer\s+[A-Za-z0-9._~+/=-]{20,}',
    'AKIA[0-9A-Z]{16}',
    'gh[pousr]_[A-Za-z0-9]{20,}',
    'xox[baprs]-[A-Za-z0-9-]{10,}',
    'AIza[0-9A-Za-z_-]{20,}',
    '-----BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY-----',
    'api[_-]?key\s*[:=]\s*[A-Za-z0-9_\-]{24,}'
)

function Get-TargetFiles {
    if ($All) {
        $ignored = @(
            'node_modules', 'target', 'dist', 'dist-ssr',
            '\.git', 'sidecar\.build', 'test-results', 'playwright-report'
        )
        Get-ChildItem -Path $projectRoot -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object {
                $relative = $_.FullName.Substring($projectRoot.Length).TrimStart('\', '/')
                -not ($ignored | Where-Object { $relative -match $_ })
            } |
            ForEach-Object { $_.FullName }
    }
    else {
        git -C $projectRoot diff --cached --name-only --diff-filter=ACM |
            ForEach-Object { Join-Path $projectRoot $_ }
    }
}

$files = @(Get-TargetFiles | Where-Object { Test-Path $_ -PathType Leaf })
$violations = @()

foreach ($file in $files) {
    $content = Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    foreach ($pattern in $patterns) {
        $found = [regex]::Matches($content, $pattern)
        foreach ($match in $found) {
            $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
            $snippet = $match.Value
            if ($snippet.Length -gt 40) { $snippet = $snippet.Substring(0, 40) + "..." }
            $violations += [pscustomobject]@{
                File  = $file.Substring($projectRoot.Length).TrimStart('\', '/')
                Line  = $lineNumber
                Match = $snippet
            }
        }
    }
}

if ($violations.Count -gt 0) {
    Write-Host ""
    Write-Host "!! Secret scan FAILED - possible API keys detected (dead rule: keys never enter the repo) !!" -ForegroundColor Red
    Write-Host ""
    $violations | Sort-Object File, Line | ForEach-Object {
        Write-Host ("  {0}:{1}  {2}" -f $_.File, $_.Line, $_.Match) -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Remove the secret content (keys live only in local localStorage), then retry." -ForegroundColor Red
    exit 1
}

Write-Host "Secret scan passed: $($files.Count) file(s) checked, no secrets found." -ForegroundColor Green
exit 0
