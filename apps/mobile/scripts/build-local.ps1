param(
    [Parameter(Mandatory = $true)][string]$ToolsPath,
    [string]$Architecture = 'arm64-v8a',
    [string]$GradleCache
)
$ErrorActionPreference = 'Stop'
$mobile = Split-Path $PSScriptRoot -Parent
$root = Split-Path (Split-Path $mobile -Parent) -Parent
$jdk = Get-ChildItem -LiteralPath $ToolsPath -Directory -Filter 'jdk-*' |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe') } |
    Select-Object -First 1
if (!$jdk) { throw 'JDK not found in ToolsPath.' }
$sdk = Join-Path $ToolsPath 'sdk'
if (!(Test-Path -LiteralPath $sdk)) { throw 'Android SDK not found in ToolsPath/sdk.' }
if (!(Test-Path -LiteralPath (Join-Path $mobile 'android/gradlew.bat'))) {
    throw 'Run npx expo prebuild --platform android --no-install inside apps/mobile first.'
}
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = $sdk
$env:NODE_ENV = 'production'
if (!$GradleCache) { $GradleCache = Join-Path $root '.g' }
$env:GRADLE_USER_HOME = [IO.Path]::GetFullPath($GradleCache)
$env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
& node (Join-Path $PSScriptRoot 'patch-android-gradle.js')
if ($LASTEXITCODE -ne 0) { throw 'Android compatibility patch failed.' }
Push-Location (Join-Path $mobile 'android')
try {
    & ./gradlew.bat --no-daemon --no-watch-fs --no-configuration-cache --max-workers=1 --console=plain '-Dorg.gradle.internal.instrumentation.agent=false' '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8' "--project-cache-dir=$env:GRADLE_USER_HOME/project" "-PreactNativeArchitectures=$Architecture" ':app:assembleRelease'
    if ($LASTEXITCODE -ne 0) { throw 'Gradle APK build failed.' }
    $reports = Join-Path $root 'reports'
    New-Item -ItemType Directory -Force -Path $reports | Out-Null
    $output = Join-Path $reports 'shelf-offline.apk'
    Copy-Item -LiteralPath 'app/build/outputs/apk/release/app-release.apk' -Destination $output
    $version = (Get-Content -LiteralPath (Join-Path $mobile 'app.json') -Raw | ConvertFrom-Json).expo.version
    Copy-Item -LiteralPath $output -Destination (Join-Path $reports "shelf-offline-$version.apk")
    Get-FileHash -LiteralPath $output -Algorithm SHA256
} finally { Pop-Location }
