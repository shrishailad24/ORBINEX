$endpoints = @(
  '/api/weather',
  '/api/news',
  '/api/markets',
  '/api/maritime',
  '/api/flights',
  '/api/satellites',
  '/api/space-weather',
  '/api/stats',
  '/api/geo/reverse?lat=20.5937&lng=78.9629'
)

Write-Host "=== BENCHMARKING ENDPOINTS ==="
foreach ($ep in $endpoints) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $res = Invoke-WebRequest -Uri "http://localhost:3000$ep" -UseBasicParsing -TimeoutSec 35
    $sw.Stop()
    $len = $res.Content.Length
    Write-Host ("{0,5} ms | {1} bytes | status {2} | {3}" -f $sw.ElapsedMilliseconds, $len, $res.StatusCode, $ep)
  } catch {
    $sw.Stop()
    Write-Host ("{0,5} ms | FAILED       | {1} : {2}" -f $sw.ElapsedMilliseconds, $ep, $_.Exception.Message)
  }
}
