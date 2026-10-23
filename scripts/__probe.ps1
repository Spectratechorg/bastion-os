foreach ($path in @('/api/health','/api/team','/api/performance','/api/settings','/api/contracts','/api/guard/sos','/api/me','/api/guard/me')) {
  try {
    $r = Invoke-WebRequest -Uri ("http://127.0.0.1:3100" + $path) -TimeoutSec 25 -ErrorAction Stop
    Write-Output ("$path -> $($r.StatusCode)")
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    Write-Output ("$path -> $code")
  }
}
