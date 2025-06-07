# SSH Test Script with automatic password
$password = "klrklr89!"
$username = "remote"
$hostname = "192.168.8.130"

# Create a process to handle SSH with password
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "ssh"
$psi.Arguments = "-o StrictHostKeyChecking=no -o PreferredAuthentications=password $username@$hostname `"hostname && whoami && pwd && echo 'SSH test completed successfully'`""
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi
$process.Start()

# Send password when prompted
Start-Sleep -Seconds 2
$process.StandardInput.WriteLine($password)
$process.StandardInput.Close()

# Wait for completion and get output
$process.WaitForExit(15000)  # 15 second timeout
$output = $process.StandardOutput.ReadToEnd()
$error = $process.StandardError.ReadToEnd()

Write-Host "SSH Output:"
Write-Host $output
if ($error) {
    Write-Host "SSH Error:"
    Write-Host $error
}

Write-Host "Exit Code: $($process.ExitCode)"
