$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $root "assets\js\supabase-config.js"
$zipPath = Join-Path (Split-Path -Parent $root) "chxnb-login-final.zip"

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "Config file not found: $configPath"
}

Write-Host "=== chxnb auth setup ==="
Write-Host ""
Write-Host "From Supabase Dashboard -> Project Settings -> API:"
Write-Host "1) Project URL"
Write-Host "2) Publishable key (NOT secret key)"
Write-Host ""

$projectUrl = Read-Host "Paste Project URL"
$publishableKey = Read-Host "Paste Publishable key"

if ([string]::IsNullOrWhiteSpace($projectUrl) -or [string]::IsNullOrWhiteSpace($publishableKey)) {
  throw "Project URL and Publishable key cannot be empty."
}

$content = @"
// These values are safe to expose in a browser when Supabase RLS is enabled.
export const SUPABASE_URL = "$projectUrl";
export const SUPABASE_PUBLISHABLE_KEY = "$publishableKey";

export const isSupabaseConfigured =
  !SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_PUBLISHABLE_KEY");
"@

Set-Content -LiteralPath $configPath -Value $content -Encoding UTF8

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $root "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "Done."
Write-Host "Final deploy package:"
Write-Host $zipPath
