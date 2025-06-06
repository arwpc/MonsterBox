# PowerShell script to SSH into any RPI with automatic password authentication from character config
param(
    [Parameter(Mandatory=$true)]
    [string]$Command,
    [Parameter(Mandatory=$false)]
    [string]$Host = "192.168.8.120"  # Default to Orlok
)

# Function to get SSH credentials from character configuration
function Get-SSHCredentials {
    param([string]$TargetHost)

    try {
        # Load characters configuration
        $charactersPath = "data/characters.json"
        if (-not (Test-Path $charactersPath)) {
            throw "Characters configuration file not found: $charactersPath"
        }

        $characters = Get-Content $charactersPath | ConvertFrom-Json

        # Find character by RPI host IP
        foreach ($character in $characters) {
            if ($character.animatronic -and $character.animatronic.rpi_config -and $character.animatronic.rpi_config.host -eq $TargetHost) {
                return @{
                    Host = $character.animatronic.rpi_config.host
                    User = $character.animatronic.rpi_config.user
                    Password = $character.animatronic.rpi_config.password
                    CharacterName = $character.char_name
                }
            }
        }

        # Fallback to environment variables if not found in character config
        Write-Host "⚠️ Character not found for host $TargetHost, using environment variables" -ForegroundColor Yellow
        return @{
            Host = $TargetHost
            User = $env:RPI_SSH_USER
            Password = $env:RPI_SSH_PASSWORD
            CharacterName = "Unknown"
        }
    }
    catch {
        Write-Host "❌ Error loading SSH credentials: $_" -ForegroundColor Red
        throw
    }
}

# Get SSH credentials for the target host
$credentials = Get-SSHCredentials -TargetHost $Host

if (-not $credentials.User -or -not $credentials.Password) {
    Write-Host "❌ SSH credentials not found for host $Host" -ForegroundColor Red
    Write-Host "   Please ensure the character configuration includes SSH credentials" -ForegroundColor Red
    exit 1
}

Write-Host "🎃 Executing command on $($credentials.CharacterName) ($Host): $Command" -ForegroundColor Green

# Use plink (PuTTY's command line tool) for automatic password authentication
# -batch: disable interactive prompts
# -pw: specify password
try {
    & plink -ssh -l $credentials.User -pw $credentials.Password -batch $Host $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Command failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} catch {
    Write-Host "❌ Error executing command: $_" -ForegroundColor Red
    exit 1
}
