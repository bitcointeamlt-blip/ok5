# Restart Local Servers Script (ASCII-safe)

Write-Host "Restarting local servers..." -ForegroundColor Cyan

function Stop-Ports([int[]]$ports) {
  foreach ($p in $ports) {
    try {
      $matches = netstat -ano | Select-String (":" + $p)
      if ($matches) {
        Write-Host ("Port {0} is in use, attempting to stop..." -f $p) -ForegroundColor Yellow
        foreach ($m in $matches) {
          $line = $m.ToString().Trim()
          $parts = ($line -split "\s+") | Where-Object { $_ -ne "" }
          $procId = $parts[-1]
          if ($procId -match '^\d+$') {
            try {
              Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
              Write-Host ("Stopped PID {0} (port {1})" -f $procId, $p) -ForegroundColor Green
            } catch {
              Write-Host ("Failed to stop PID {0} (port {1})" -f $procId, $p) -ForegroundColor Yellow
            }
          }
        }
      } else {
        Write-Host ("Port {0} is free" -f $p) -ForegroundColor Green
      }
    } catch {
      Write-Host ("Failed to check/stop port {0}: {1}" -f $p, $_.Exception.Message) -ForegroundColor Yellow
    }
  }
}

# First try to stop anything bound to the known dev ports
Stop-Ports @(7005, 2567, 5173)

# Then stop common dev processes (best-effort)
Write-Host "Stopping node/vite processes (best-effort)..." -ForegroundColor Yellow
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^(node|vite)$' -or $_.ProcessName -like '*node*' -or $_.ProcessName -like '*vite*' }
if ($procs) {
  foreach ($p in $procs) {
    try {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    } catch {}
  }
  Write-Host "Process stop attempted." -ForegroundColor Green
} else {
  Write-Host "No node/vite processes found." -ForegroundColor Green
}

Start-Sleep -Seconds 2

Write-Host "Done. You can now run start-local-servers.ps1" -ForegroundColor Cyan










