param(
  [Parameter(Mandatory = $true)]
  [string]$Tag,

  [string]$DbPath = 'D:\paw.db',

  [string]$SqliteExe = 'sqlite3',

  [string]$ApiBase = 'https://pawapi.oxs.at',

  [string]$AuthToken = ''
)

$ErrorActionPreference = 'Stop'

function Require-Tool([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Tool '$Name' not found in PATH."
  }
}

function Sql-Escape([string]$Value) {
  return $Value.Replace("'", "''")
}

function Run-Csv([string]$Sql, [string]$FileName) {
  $outPath = Join-Path $script:OutDir $FileName
  & $script:SqliteExe $script:DbPath -header -csv $Sql | Out-File -FilePath $outPath -Encoding utf8
}

function Run-Json([string]$Sql, [string]$FileName) {
  $outPath = Join-Path $script:OutDir $FileName
  try {
    & $script:SqliteExe $script:DbPath -json $Sql | Out-File -FilePath $outPath -Encoding utf8
  } catch {
    '[]' | Out-File -FilePath $outPath -Encoding utf8
  }
}

function Write-HttpSnapshot([string]$Url, [string]$OutFile, [string]$Token = '') {
  $outPath = Join-Path $script:OutDir $OutFile
  "GET $Url" | Out-File -FilePath $outPath -Encoding utf8

  try {
    $headers = @{}
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
      $headers['Authorization'] = "Bearer $Token"
    }

    $response = Invoke-WebRequest -Uri $Url -Method Get -Headers $headers -ErrorAction Stop
    "HTTP $($response.StatusCode)" | Out-File -FilePath $outPath -Encoding utf8 -Append
    $response.Headers.GetEnumerator() | ForEach-Object { "$($_.Key): $($_.Value)" } | Out-File -FilePath $outPath -Encoding utf8 -Append
    '' | Out-File -FilePath $outPath -Encoding utf8 -Append
    $response.Content | Out-File -FilePath $outPath -Encoding utf8 -Append
  } catch {
    if ($_.Exception.Response) {
      $statusCode = [int]$_.Exception.Response.StatusCode
      "HTTP $statusCode" | Out-File -FilePath $outPath -Encoding utf8 -Append
      '' | Out-File -FilePath $outPath -Encoding utf8 -Append
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $body = $reader.ReadToEnd()
          $reader.Dispose()
          $body | Out-File -FilePath $outPath -Encoding utf8 -Append
        }
      } catch {
        $_.Exception.Message | Out-File -FilePath $outPath -Encoding utf8 -Append
      }
    } else {
      $_.Exception.Message | Out-File -FilePath $outPath -Encoding utf8 -Append
    }
  }
}

if (-not [string]::IsNullOrWhiteSpace($SqliteExe) -and (Test-Path -LiteralPath $SqliteExe)) {
  $SqliteExe = (Resolve-Path -LiteralPath $SqliteExe).Path
} else {
  Require-Tool $SqliteExe
}

if (-not (Test-Path -LiteralPath $DbPath)) {
  throw "Database not found: $DbPath"
}

$repoRoot = $PSScriptRoot
$OutDir = Join-Path $repoRoot ("tmp/public-scan-export-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$tagSql = Sql-Escape $Tag

$tagLookupExact = @"
SELECT t.tag_id, t.tag_type, t.active, t.animal_id, a.name AS animal_name, a.account_id, a.is_archived
FROM animal_tags t
LEFT JOIN animals a ON a.id = t.animal_id
WHERE t.tag_id = '$tagSql'
ORDER BY t.active DESC, t.tag_id DESC;
"@

$tagLookupContains = @"
SELECT t.tag_id, t.tag_type, t.active, t.animal_id, a.name AS animal_name, a.account_id, a.is_archived
FROM animal_tags t
LEFT JOIN animals a ON a.id = t.animal_id
WHERE t.tag_id LIKE '%' || '$tagSql' || '%'
ORDER BY t.active DESC, t.tag_id DESC
LIMIT 50;
"@

Run-Csv $tagLookupExact '01_tag_lookup_exact.csv'
Run-Csv $tagLookupContains '02_tag_lookup_contains.csv'
Run-Json $tagLookupExact '01_tag_lookup_exact.json'
Run-Json $tagLookupContains '02_tag_lookup_contains.json'

$animalId = (& $SqliteExe $DbPath "SELECT t.animal_id FROM animal_tags t WHERE t.tag_id = '$tagSql' LIMIT 1;").Trim()
if ([string]::IsNullOrWhiteSpace($animalId)) {
  $animalId = (& $SqliteExe $DbPath "SELECT t.animal_id FROM animal_tags t WHERE t.tag_id LIKE '%' || '$tagSql' || '%' LIMIT 1;").Trim()
}

if (-not [string]::IsNullOrWhiteSpace($animalId)) {
  $animalSql = @"
SELECT id, account_id, name, species, breed, birthdate, address, is_archived, created_at
FROM animals
WHERE id = '$animalId';
"@

  $sharingSql = @"
SELECT animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields
FROM animal_sharing
WHERE animal_id = '$animalId'
ORDER BY role;
"@

  $docsSql = @"
SELECT id, animal_id, doc_type, allowed_roles, added_by_role, added_by_account, analysis_status, ocr_provider, created_at
FROM documents
WHERE animal_id = '$animalId'
ORDER BY created_at DESC;
"@

  $pagesSql = @"
SELECT dp.document_id, dp.page_number, dp.image_path
FROM document_pages dp
JOIN documents d ON d.id = dp.document_id
WHERE d.animal_id = '$animalId'
ORDER BY dp.document_id, dp.page_number;
"@

  Run-Csv $animalSql '03_animal.csv'
  Run-Csv $sharingSql '04_animal_sharing.csv'
  Run-Csv $docsSql '05_documents.csv'
  Run-Csv $pagesSql '06_document_pages.csv'

  Run-Json $animalSql '03_animal.json'
  Run-Json $sharingSql '04_animal_sharing.json'
  Run-Json $docsSql '05_documents.json'
  Run-Json $pagesSql '06_document_pages.json'
} else {
  "No animal_id found for tag '$Tag'." | Out-File -FilePath (Join-Path $OutDir '03_no_animal_found.txt') -Encoding utf8
}

$globalAllowedRolesSql = @"
SELECT
  COUNT(*) AS total_documents,
  SUM(CASE WHEN allowed_roles IS NULL THEN 1 ELSE 0 END) AS allowed_roles_null,
  SUM(CASE WHEN allowed_roles LIKE '%guest%' THEN 1 ELSE 0 END) AS has_guest,
  SUM(CASE WHEN allowed_roles LIKE '%readonly%' THEN 1 ELSE 0 END) AS has_readonly
FROM documents;
"@

$globalGuestSharingSql = @"
SELECT
  (SELECT COUNT(*) FROM animals) AS animals_total,
  (SELECT COUNT(DISTINCT animal_id) FROM animal_sharing WHERE role = 'guest') AS animals_with_guest_sharing;
"@

$globalRoleVariantsSql = @"
SELECT DISTINCT allowed_roles
FROM documents
ORDER BY allowed_roles
LIMIT 200;
"@

Run-Csv $globalAllowedRolesSql '07_global_allowed_roles_stats.csv'
Run-Csv $globalGuestSharingSql '08_global_guest_sharing_stats.csv'
Run-Csv $globalRoleVariantsSql '09_global_allowed_roles_variants.csv'

Run-Json $globalAllowedRolesSql '07_global_allowed_roles_stats.json'
Run-Json $globalGuestSharingSql '08_global_guest_sharing_stats.json'
Run-Json $globalRoleVariantsSql '09_global_allowed_roles_variants.json'

$encodedTag = [System.Uri]::EscapeDataString($Tag)
$publicUrl = "$ApiBase/api/public/tag/$encodedTag"
Write-HttpSnapshot -Url $publicUrl -OutFile '10_api_public_tag_unauth.txt'

if (-not [string]::IsNullOrWhiteSpace($AuthToken)) {
  Write-HttpSnapshot -Url $publicUrl -OutFile '11_api_public_tag_auth.txt' -Token $AuthToken
  $byTagUrl = "$ApiBase/api/animals/by-tag/$encodedTag"
  Write-HttpSnapshot -Url $byTagUrl -OutFile '12_api_by_tag_auth.txt' -Token $AuthToken
} else {
  'AUTH_TOKEN not provided. Auth API snapshots skipped.' | Out-File -FilePath (Join-Path $OutDir '11_auth_skipped.txt') -Encoding utf8
}

@"
created_at=$([DateTime]::UtcNow.ToString('o'))
repo_root=$repoRoot
db_path=$DbPath
tag_input=$Tag
api_base=$ApiBase
animal_id=$animalId
"@ | Out-File -FilePath (Join-Path $OutDir '00_meta.txt') -Encoding utf8

$zipPath = "$OutDir.zip"
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $OutDir '*') -DestinationPath $zipPath

Write-Host 'Done'
Write-Host "Export directory: $OutDir"
Write-Host "Zip: $zipPath"
