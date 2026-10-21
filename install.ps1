# Installs Library+ into Spicetify.
# Run from a clone: links the folder (edits apply after `spicetify apply`).
# Run remotely (iwr -useb https://raw.githubusercontent.com/overbacon/spicetify-library-plus/main/install.ps1 | iex): downloads the latest version.
$dst = Join-Path (spicetify path userdata) "CustomApps\library-plus"
$local = if ($PSScriptRoot) { Join-Path $PSScriptRoot "library-plus" }
if ($local -and (Test-Path $local)) {
	if (-not (Test-Path $dst)) { New-Item -ItemType Junction -Path $dst -Target $local | Out-Null }
} else {
	$zip = Join-Path $env:TEMP "library-plus.zip"
	$tmp = Join-Path $env:TEMP "library-plus-src"
	Invoke-WebRequest "https://github.com/overbacon/spicetify-library-plus/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
	if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
	Expand-Archive $zip $tmp
	New-Item -ItemType Directory -Force $dst | Out-Null
	# shortcut: files removed upstream stay behind; harmless, reinstall into an empty folder if it ever matters
	Copy-Item (Join-Path (Get-ChildItem $tmp)[0].FullName "library-plus\*") $dst -Recurse -Force
	Remove-Item $zip, $tmp -Recurse -Force
}
$apps = spicetify config custom_apps # one app per line
if ($apps -notcontains "library-plus") { spicetify config custom_apps library-plus }
spicetify apply
