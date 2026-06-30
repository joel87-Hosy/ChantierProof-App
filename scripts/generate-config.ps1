$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"
$configPath = Join-Path $root "lib\config.js"

if (-not (Test-Path $envPath)) {
  throw "Missing .env file. Copy .env.example to .env and fill the Supabase values."
}

$values = @{}
Get-Content $envPath | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) {
    return
  }

  $parts = $line.Split("=", 2)
  if ($parts.Count -eq 2) {
    $values[$parts[0].Trim()] = $parts[1].Trim()
  }
}

$required = @("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_STORAGE_BUCKET")
foreach ($key in $required) {
  if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
    throw "Missing required key in .env: $key"
  }
}

function ConvertTo-JsString([string] $value) {
  return $value.Replace("\", "\\").Replace('"', '\"')
}

$supabaseUrl = ConvertTo-JsString $values["SUPABASE_URL"]
$supabaseAnonKey = ConvertTo-JsString $values["SUPABASE_ANON_KEY"]
$storageBucket = ConvertTo-JsString $values["SUPABASE_STORAGE_BUCKET"]
$publicSiteUrl = ""
if ($values.ContainsKey("PUBLIC_SITE_URL")) {
  $publicSiteUrl = ConvertTo-JsString $values["PUBLIC_SITE_URL"].TrimEnd("/")
}

$content = @"
window.CHANTIERPROOF_CONFIG = {
  supabaseUrl: "$supabaseUrl",
  supabaseAnonKey: "$supabaseAnonKey",
  storageBucket: "$storageBucket",
  publicSiteUrl: "$publicSiteUrl"
};
"@

Set-Content -Path $configPath -Value $content -Encoding UTF8
Write-Host "Generated lib/config.js from .env"
