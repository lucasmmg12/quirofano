# Test the send_whatsapp RPC function via Supabase
$anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDIyNzQsImV4cCI6MjA4NTYxODI3NH0.-85OS1dohc9gh4U4qBhEBlqHi9Bq7l7H6JnzcUzrCIg'
$baseUrl = 'https://hakysnqiryimxbwdslwe.supabase.co/rest/v1'

$headers = @{
    'apikey'        = $anonKey
    'Authorization' = "Bearer $anonKey"
    'Content-Type'  = 'application/json'
    'Prefer'        = 'return=representation'
}

$body = @{
    p_content   = 'Test desde Sistema ADM-QUI via RPC'
    p_number    = '3415551234'
    p_media_url = $null
} | ConvertTo-Json -Depth 3

Write-Host "Testing send_whatsapp via RPC..."
try {
    $r = Invoke-RestMethod -Uri "$baseUrl/rpc/send_whatsapp" -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 15
    Write-Host "SUCCESS: $($r | ConvertTo-Json -Compress)"
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        Write-Host "Response: $($reader.ReadToEnd())"
    }
}
