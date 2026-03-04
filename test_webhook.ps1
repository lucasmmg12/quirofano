$body = @{
    eventName = 'message.incoming'
    data      = @{
        from = '5492645438114'
        body = 'Test de mensaje incoming desde script'
        name = 'Test User'
    }
} | ConvertTo-Json -Depth 3

try {
    $response = Invoke-RestMethod -Uri 'https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook' -Method Post -Body $body -ContentType 'application/json'
    Write-Host "OK: $($response | ConvertTo-Json -Compress)"
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        Write-Host "Response: $($reader.ReadToEnd())"
    }
}
