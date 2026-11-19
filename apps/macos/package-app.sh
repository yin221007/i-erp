#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
configuration=${1:-release}
output_dir="$script_dir/dist"
app_dir="$output_dir/iERP.app"
swift_args=()

if [[ ${IERP_DISABLE_SWIFT_SANDBOX:-0} == 1 ]]; then
  swift_args+=(--disable-sandbox)
fi

cd "$script_dir"
swift build -c "$configuration" "${swift_args[@]}"

rm -rf "$app_dir"
mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources"
cp "$script_dir/.build/$configuration/IERPMac" "$app_dir/Contents/MacOS/IERPMac"
cp "$script_dir/Resources/Info.plist" "$app_dir/Contents/Info.plist"
cp "$script_dir/Resources/iERP.icns" "$app_dir/Contents/Resources/iERP.icns"
chmod 755 "$app_dir/Contents/MacOS/IERPMac"

if [[ -n ${IERP_ORIGIN:-} ]]; then
  plutil -replace IERPServerOrigin -string "$IERP_ORIGIN" "$app_dir/Contents/Info.plist"
fi

# 本机临时签名可直接双击测试；正式分发时由 Developer ID 签名替换。
codesign --force --deep --sign - "$app_dir"
ditto -c -k --sequesterRsrc --keepParent "$app_dir" "$output_dir/iERP-macOS.zip"

echo "$app_dir"
echo "$output_dir/iERP-macOS.zip"
