<#
  Monta a pasta dist\PoderEmXeque (site + Node portátil + banco enxuto + atalhos) e, se o Inno Setup estiver instalado,
  gera installer\Output\PoderEmXeque-Setup.exe.

  Uso (na raiz do projeto):
    powershell -ExecutionPolicy Bypass -File scripts\package-windows.ps1
    powershell -ExecutionPolicy Bypass -File scripts\package-windows.ps1 -SemInstalador   # só a pasta
  Pré-requisitos: Node 24+, npm install feito e data\congresso.db (ou data\congresso.prod.db) presente.
#>
param([switch]$SemInstalador)
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$pacote = Join-Path $raiz "dist\PoderEmXeque"
$prod = Join-Path $raiz "data\congresso.prod.db"

Write-Host "1/5 Banco enxuto"
if (-not (Test-Path $prod)) { npm run db:slim; if ($LASTEXITCODE) { throw "falhou db:slim" } }

Write-Host "2/5 Build autossuficiente (standalone)"
$env:NEXT_STANDALONE = "1"
$env:CONGRESSO_DB = Join-Path $env:TEMP "poder-em-xeque-build.db"   # o build não precisa do banco real
npm run build
if ($LASTEXITCODE) { throw "falhou o build" }
Remove-Item Env:NEXT_STANDALONE, Env:CONGRESSO_DB

Write-Host "3/5 Montando a pasta"
if (Test-Path $pacote) { Remove-Item $pacote -Recurse -Force }
New-Item -ItemType Directory -Force $pacote | Out-Null
Copy-Item ".next\standalone\*" $pacote -Recurse -Force
New-Item -ItemType Directory -Force (Join-Path $pacote ".next") | Out-Null
Copy-Item ".next\static" (Join-Path $pacote ".next\static") -Recurse -Force
Copy-Item "public" (Join-Path $pacote "public") -Recurse -Force
Copy-Item (Get-Command node).Source (Join-Path $pacote "node.exe")        # Node portátil: a mesma versão com que o site foi testado
New-Item -ItemType Directory -Force (Join-Path $pacote "data") | Out-Null
Copy-Item $prod (Join-Path $pacote "data\congresso.db")
Copy-Item "LICENSE" $pacote
Copy-Item "installer\Iniciar.bat", "installer\Parar.bat", "installer\LEIA-ME.txt" $pacote

$tam = [math]::Round(((Get-ChildItem $pacote -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB)
Write-Host "   pasta pronta: $pacote ($tam MB)"

if ($SemInstalador) { Write-Host "4/5 e 5/5 ignorados (-SemInstalador)"; return }

Write-Host "4/5 Procurando o Inno Setup"
$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { Write-Host "   Inno Setup não encontrado. Instale com: winget install JRSoftware.InnoSetup  e rode de novo."; return }

Write-Host "5/5 Gerando o instalador"
& $iscc "installer\setup.iss"
if ($LASTEXITCODE) { throw "falhou o ISCC" }
$exe = Get-Item "installer\Output\PoderEmXeque-Setup.exe"
Write-Host ("   pronto: {0} ({1} MB)" -f $exe.FullName, [math]::Round($exe.Length / 1MB))
