# Deploy Beto Assistant Edge Function
# Prerequisites: Set these env variables before running:
#   $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'
#   $env:OPENAI_API_KEY = 'sk-proj-...'  (optional, for setting secret)

$projectRef = 'hakysnqiryimxbwdslwe'

$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) {
    Write-Host "ERROR: SUPABASE_ACCESS_TOKEN env variable not set."
    Write-Host "Set it with: `$env:SUPABASE_ACCESS_TOKEN = 'sbp_...'"
    exit 1
}

$headers = @{
    'Authorization' = "Bearer $token"
    'Content-Type'  = 'application/json'
}

# Step 0: Set OPENAI_API_KEY secret if provided
Write-Host "Step 0: Checking OPENAI_API_KEY..."
$openaiKey = $env:OPENAI_API_KEY
if (-not $openaiKey) {
    Write-Host "OPENAI_API_KEY not set. Skipping. (Set with `$env:OPENAI_API_KEY = 'sk-proj-...')"
} else {
    try {
        $secretBody = "[{`"name`":`"OPENAI_API_KEY`",`"value`":`"$openaiKey`"}]"
        $r0 = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/secrets" -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($secretBody)) -TimeoutSec 30
        Write-Host "Secret set OK"
    }
    catch {
        Write-Host "Secret error: $($_.Exception.Message)"
    }
}

# Step 1: Deploy function via Supabase CLI
Write-Host ""
Write-Host "Step 1: Deploying beto-assistant via Supabase CLI..."
npx supabase functions deploy beto-assistant --project-ref $projectRef --no-verify-jwt 2>&1

Write-Host ""
Write-Host "Done!"
