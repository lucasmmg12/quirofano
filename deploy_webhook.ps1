$token = 'sbp_5b15e67cd11ce4fd0768b3c956db8f7968d4f6b1'
$projectRef = 'hakysnqiryimxbwdslwe'
$functionName = 'whatsapp-webhook'

# Step 1: Ensure function exists
$headers = @{
    'Authorization' = "Bearer $token"
    'Content-Type'  = 'application/json'
}

$metadata = @{
    slug       = $functionName
    name       = $functionName
    verify_jwt = $false
} | ConvertTo-Json

Write-Host "Step 1: Ensuring function metadata..."
try {
    $r = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/functions" -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($metadata)) -TimeoutSec 30
    Write-Host "Created: $($r | ConvertTo-Json -Compress)"
}
catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "Status: $code (already exists or error)"
}

# Step 2: Deploy body
Write-Host ""
Write-Host "Step 2: Deploying function body..."
$source = Get-Content "supabase\functions\$functionName\index.ts" -Raw -Encoding UTF8
$tempFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tempFile, $source, [System.Text.Encoding]::UTF8)

try {
    $deployHeaders = @{
        'Authorization' = "Bearer $token"
        'Content-Type'  = 'application/x-eszip'
    }
    $fileBytes = [System.IO.File]::ReadAllBytes($tempFile)
    $r2 = Invoke-WebRequest -Uri "https://api.supabase.com/v1/projects/$projectRef/functions/$functionName/body" -Method Put -Headers $deployHeaders -Body $fileBytes -TimeoutSec 30
    Write-Host "Deploy result: $($r2.StatusCode)"
    Write-Host $r2.Content
}
catch {
    Write-Host "Deploy ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        Write-Host "Response: $($reader.ReadToEnd())"
    }
}

Remove-Item $tempFile -Force
