#!/usr/bin/env bash
# Create placeholder SVG logos for each integration.
# Each is a 64x64 circle with the service's first letter and a distinct color.
# Replace with real logos when available.

set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/public/integrations"
mkdir -p "$DIR"

create_logo() {
  local file="$1" letter="$2" color="$3"
  cat > "$DIR/$file" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="32" fill="$color"/>
  <text x="32" y="32" text-anchor="middle" dominant-baseline="central"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"
        font-size="28" font-weight="600" fill="#fff">$letter</text>
</svg>
SVG
  echo "  Created $file"
}

echo "Creating placeholder integration logos in $DIR ..."

create_logo "ssa.svg"        "S" "#1a4480"
create_logo "playwright.svg" "P" "#2d8c3c"
create_logo "cron.svg"       "C" "#6b4c9a"
create_logo "chronicle.svg"  "C" "#b35900"
create_logo "casestatus.svg" "C" "#0071bc"
create_logo "mycase.svg"     "M" "#d83933"
create_logo "outlook.svg"    "O" "#0078d4"
create_logo "resend.svg"     "R" "#111111"
create_logo "twilio.svg"     "T" "#f22f46"
create_logo "calltools.svg"  "C" "#4a7c59"
create_logo "gemini.svg"     "G" "#4285f4"
create_logo "deepgram.svg"   "D" "#13ef93"
create_logo "anthropic.svg"  "A" "#cc785c"
create_logo "postgresql.svg" "P" "#336791"
create_logo "redis.svg"      "R" "#dc382d"
create_logo "s3.svg"         "S" "#569a31"
create_logo "n8n.svg"        "n" "#ff6d5a"
create_logo "vercel.svg"     "V" "#000000"
create_logo "clerk.svg"      "C" "#6c47ff"

echo "Done! ${DIR} now contains $(ls "$DIR"/*.svg | wc -l | tr -d ' ') SVGs."
