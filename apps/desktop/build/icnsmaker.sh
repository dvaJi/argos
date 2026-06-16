#!/bin/bash

INPUT_PNG="icon.png"        # Path to the source PNG image
ICONSET_NAME="icon.iconset" # Name of the output .iconset folder

SIZES=(
  "16x16" "16x16"
  "32x32" "16x16@2x"
  "32x32" "32x32"
  "64x64" "32x32@2x"
  "128x128" "64x64@2x"
  "128x128" "128x128"
  "256x256" "128x128@2x"
  "256x256" "256x256"
  "512x512" "256x256@2x"
  "512x512" "512x512"
  "1024x1024" "512x512@2x"
)

mkdir -p "$ICONSET_NAME"

for SIZE in "${SIZES[@]}"; do
  filename="icon_${SIZE}.png"
  output_path="$ICONSET_NAME/$filename"
  size_parts=(${SIZE//x/ })
  width=${size_parts[0]//@2x/}  # Strip @2x to get the actual size
  height=${size_parts[1]//@2x/} # Strip @2x to get the actual size

  sips -z "${height}" "${width}" "$INPUT_PNG" --out "$output_path"
  echo "Generated: $output_path"
done

echo "Iconset folder '$ICONSET_NAME' created."

iconutil -c icns icon.iconset -o icon_mac.icns

echo "icns icon_mac.icns created,check and rename."

rm -rf "$ICONSET_NAME"
echo "Removed iconset folder '$ICONSET_NAME'."
