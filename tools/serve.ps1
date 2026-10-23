# Minimal static file server for local preview (no install needed).
# Usage: powershell -ExecutionPolicy Bypass -File tools/serve.ps1 [-Port 8000]
param([int]$Port = 8000)
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$types = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".js"="text/javascript; charset=utf-8";
            ".json"="application/json"; ".png"="image/png"; ".jpg"="image/jpeg"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".md"="text/plain; charset=utf-8"; ".webmanifest"="application/manifest+json"; ".csv"="text/csv; charset=utf-8" }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $root at http://localhost:$Port/  (Ctrl+C to stop)"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ($rel -eq "") { $rel = "index.html" }
      $path = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      if ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $ext = [System.IO.Path]::GetExtension($path).ToLower()
        $res.ContentType = if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" }
        $res.Headers.Add("Cache-Control", "no-store")
        $res.ContentLength64 = $bytes.Length
        if ($ctx.Request.HttpMethod -ne "HEAD") { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $res.StatusCode = 404
      }
    } catch {
      Write-Output "Request error: $($_.Exception.Message)"
    } finally {
      try { $res.Close() } catch {}
    }
  }
} finally { $listener.Stop() }
