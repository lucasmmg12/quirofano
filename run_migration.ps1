$body = Get-Content -Path 'migrate_body.json' -Raw -Encoding UTF8
$uri = 'https://api.supabase.com/v1/projects/hakysnqiryimxbwdslwe/database/query'
$token = 'sbp_5b15e67cd11ce4fd0768b3c956db8f7968d4f6b1'
$headers = @{
    'Authorization' = "Bearer $token"
    'Content-Type'  = 'application/json'
}
try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
    Write-Host "SUCCESS"
    Write-Host ($response | ConvertTo-Json -Compress -Depth 5)
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        Write-Host "Body: $($reader.ReadToEnd())"
    }
}
