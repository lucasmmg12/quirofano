$body = Get-Content -Path 'migrate_body.json' -Raw -Encoding UTF8
$uri = 'https://api.supabase.com/v1/projects/hakysnqiryimxbwdslwe/database/query'

# Intentar leer SUPABASE_ACCESS_TOKEN desde .env para evitar exponer credenciales en Git
$token = $null
if (Test-Path '.env') {
    $envTokenLine = Get-Content -Path '.env' | Where-Object { $_ -match '^SUPABASE_ACCESS_TOKEN=(.*)' }
    if ($envTokenLine) {
        $token = $envTokenLine.Split('=', 2)[1].Trim()
    }
}

if (-not $token) {
    Write-Host "ERROR: SUPABASE_ACCESS_TOKEN no encontrado en el archivo .env"
    exit 1
}

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
