Add-Type -AssemblyName System.Drawing

$iconsDir = Join-Path $PSScriptRoot '..\icons'
if (-not (Test-Path $iconsDir)) { New-Item -ItemType Directory -Path $iconsDir | Out-Null }
$iconsDir = (Resolve-Path $iconsDir).Path

function New-RedIcon {
    param([string]$letter, [string]$path, [int]$r=220, [int]$g=30, [int]$b=30)
    $size = 256
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $gr = [System.Drawing.Graphics]::FromImage($bmp)
    $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $gr.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($r,$g,$b))
    $gr.FillRectangle($bg, 0, 0, $size, $size)

    $border = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120,0,0), 8)
    $gr.DrawRectangle($border, 4, 4, $size-8, $size-8)

    $font = New-Object System.Drawing.Font('Arial Black', 130, [System.Drawing.FontStyle]::Bold)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $fg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $gr.DrawString($letter, $font, $fg, $rect, $sf)
    $gr.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $png = $ms.ToArray()
    $ms.Dispose()
    $bmp.Dispose()

    $fs = [System.IO.File]::Create($path)
    $bw = New-Object System.IO.BinaryWriter($fs)
    $bw.Write([UInt16]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]1)
    $bw.Write([Byte]0)
    $bw.Write([Byte]0)
    $bw.Write([Byte]0)
    $bw.Write([Byte]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]$png.Length)
    $bw.Write([UInt32]22)
    $bw.Write($png)
    $bw.Close()
    $fs.Close()
}

New-RedIcon 'F' (Join-Path $iconsDir 'backup-firebase.ico')
New-RedIcon 'G' (Join-Path $iconsDir 'backup-github.ico')
New-RedIcon 'D' (Join-Path $iconsDir 'deploy.ico')
New-RedIcon 'P' (Join-Path $iconsDir 'pull.ico')

Write-Host "Icons created in $iconsDir"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ws = New-Object -ComObject WScript.Shell

$items = @(
    @{ Name = 'BACKUP-Firebase.lnk'; Target = 'backup-firebase.bat'; Icon = (Join-Path $iconsDir 'backup-firebase.ico') },
    @{ Name = 'BACKUP-GitHub.lnk';   Target = 'backup.bat';          Icon = (Join-Path $iconsDir 'backup-github.ico') },
    @{ Name = 'DEPLOY.lnk';          Target = 'deploy.bat';          Icon = (Join-Path $iconsDir 'deploy.ico') },
    @{ Name = 'PULL.lnk';            Target = 'pull.bat';            Icon = (Join-Path $iconsDir 'pull.ico') }
)

foreach ($i in $items) {
    $lnkPath = Join-Path $projectRoot $i.Name
    $lnk = $ws.CreateShortcut($lnkPath)
    $lnk.TargetPath       = Join-Path $projectRoot $i.Target
    $lnk.WorkingDirectory = $projectRoot
    $lnk.IconLocation     = "$($i.Icon),0"
    $lnk.Save()
    Write-Host "Updated: $($i.Name)"
}
