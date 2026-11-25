; Instalador do Poder em Xeque (Inno Setup 6). Gere com: scripts\package-windows.ps1
; Instala para o usuário atual (sem pedir administrador), em %LOCALAPPDATA%\PoderEmXeque.

#define AppNome "Poder em Xeque"
#define AppVersao "0.1.0"

[Setup]
AppId={{6F2D1B7A-3C54-4E0B-9A31-5D0C7E8B4F21}
AppName={#AppNome}
AppVersion={#AppVersao}
AppPublisher=Poder em Xeque
DefaultDirName={localappdata}\PoderEmXeque
DefaultGroupName={#AppNome}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=PoderEmXeque-Setup
Compression=lzma2/max
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
LicenseFile=..\LICENSE
UninstallDisplayName={#AppNome}
WizardStyle=modern

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked

[Files]
Source: "..\dist\PoderEmXeque\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppNome}"; Filename: "{app}\Iniciar.bat"; WorkingDir: "{app}"; Flags: runminimized
Name: "{autoprograms}\Parar o {#AppNome}"; Filename: "{app}\Parar.bat"; WorkingDir: "{app}"; Flags: runminimized
Name: "{autoprograms}\Leia-me do {#AppNome}"; Filename: "{app}\LEIA-ME.txt"
Name: "{autodesktop}\{#AppNome}"; Filename: "{app}\Iniciar.bat"; WorkingDir: "{app}"; Tasks: desktopicon; Flags: runminimized

[Run]
Filename: "{app}\Iniciar.bat"; Description: "Abrir o {#AppNome} agora"; WorkingDir: "{app}"; Flags: postinstall nowait skipifsilent shellexec

[UninstallRun]
Filename: "{app}\Parar.bat"; Flags: runhidden; RunOnceId: "PararServidor"
