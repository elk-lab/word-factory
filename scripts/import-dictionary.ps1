param(
  [string]$OutFile = "data/words_en_us.txt",
  [int]$MinLength = 2,
  [int]$MaxLength = 20
)

$ErrorActionPreference = "Stop"

$urls = @(
  "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt",
  "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt"
)

function Get-WordSource {
  param([string[]]$Candidates)

  foreach ($u in $Candidates) {
    try {
      Write-Host "Trying $u"
      $resp = Invoke-WebRequest -Uri $u -TimeoutSec 30 -UseBasicParsing
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300 -and $resp.Content) {
        Write-Host "Downloaded from $u"
        return $resp.Content
      }
    } catch {
      Write-Warning "Failed: $u"
    }
  }

  throw "Could not download a word list from known sources."
}

if ($MinLength -lt 1) { throw "MinLength must be >= 1" }
if ($MaxLength -lt $MinLength) { throw "MaxLength must be >= MinLength" }

$content = Get-WordSource -Candidates $urls
$lines = $content -split "`r?`n"

$set = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($line in $lines) {
  $w = ($line.Trim()).ToUpperInvariant()
  if ([string]::IsNullOrWhiteSpace($w)) { continue }
  if ($w.Length -lt $MinLength -or $w.Length -gt $MaxLength) { continue }
  if ($w -notmatch '^[A-Z]+$') { continue }
  $null = $set.Add($w)
}

$sorted = $set.ToArray() | Sort-Object

$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path $dir)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$sorted | Set-Content -Path $OutFile -Encoding UTF8
Write-Host "Saved $($sorted.Count) words to $OutFile"
