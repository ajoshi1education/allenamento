# Draws the app icons (a speech bubble with "A" on green, with an Italian tricolore band) into icons/.
# Re-run to regenerate:  powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force $out | Out-Null

function Draw-Icon([int]$size, [string]$file, [double]$pad) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAliasGridFit"
  # Full-bleed background (also works as a maskable icon)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 62, 200, 120)), ([System.Drawing.Color]::FromArgb(255, 24, 128, 74)), 135
  $g.FillRectangle($bg, $rect)
  $inner = $size * (1 - 2 * $pad)
  $x0 = $size * $pad; $y0 = $size * $pad
  # Speech bubble
  $bw = $inner * 0.78; $bh = $inner * 0.58
  $bx = $size / 2 - $bw / 2; $by = $y0 + $inner * 0.12
  $r = $bh * 0.32
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc([float]$bx, [float]$by, [float]($r * 2), [float]($r * 2), 180, 90)
  $path.AddArc([float]($bx + $bw - $r * 2), [float]$by, [float]($r * 2), [float]($r * 2), 270, 90)
  $path.AddArc([float]($bx + $bw - $r * 2), [float]($by + $bh - $r * 2), [float]($r * 2), [float]($r * 2), 0, 90)
  $path.AddLine([float]($bx + $bw * 0.42), [float]($by + $bh), [float]($bx + $bw * 0.26), [float]($by + $bh + $inner * 0.14))
  $path.AddLine([float]($bx + $bw * 0.28), [float]($by + $bh), [float]($bx + $r), [float]($by + $bh))
  $path.AddArc([float]$bx, [float]($by + $bh - $r * 2), [float]($r * 2), [float]($r * 2), 90, 90)
  $path.CloseFigure()
  $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(45, 0, 0, 0))
  $m = New-Object System.Drawing.Drawing2D.Matrix; $m.Translate(0, [float]($size * 0.02)); $sp = $path.Clone(); $sp.Transform($m)
  $g.FillPath($shadow, $sp)
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)), $path)
  # Letter
  if ($size -ge 64) {
    $font = New-Object System.Drawing.Font "Arial Black", ([float]($bh * 0.62)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = "Center"; $fmt.LineAlignment = "Center"
    $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 31, 140, 80))
    $g.DrawString("A", $font, $green, (New-Object System.Drawing.RectangleF ([float]$bx), ([float]($by + $bh * 0.04)), ([float]$bw), ([float]$bh)), $fmt)
  }
  # Tricolore band
  $bandY = $y0 + $inner * 0.86; $bandH = [math]::Max(2, $inner * 0.07); $bandW = $inner * 0.54; $bandX = $size / 2 - $bandW / 2
  $cols = @([System.Drawing.Color]::FromArgb(255, 0, 146, 70), [System.Drawing.Color]::White, [System.Drawing.Color]::FromArgb(255, 206, 43, 55))
  for ($i = 0; $i -lt 3; $i++) { $g.FillRectangle((New-Object System.Drawing.SolidBrush $cols[$i]), [float]($bandX + $i * $bandW / 3), [float]$bandY, [float]($bandW / 3 + 0.5), [float]$bandH) }
  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Draw-Icon 512 "icon-512.png" 0.08
Draw-Icon 192 "icon-192.png" 0.08
Draw-Icon 512 "icon-maskable-512.png" 0.18   # extra padding: phones crop maskable icons into circles/squircles
Draw-Icon 180 "apple-touch-icon.png" 0.08
Draw-Icon 32 "favicon-32.png" 0.04
Write-Output "Icons written to $out"
