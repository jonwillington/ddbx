#!/usr/bin/env bash
# Fail if src/types/ddbx.ts has drifted from the canonical ddbx-data version.
# Compares the body (everything from "export type Rating" onward), so the
# file headers can legitimately differ.
#
# Override the canonical location with DDBX_DATA_PATH=/path/to/ddbx-data.

set -euo pipefail

DDBX_DATA_PATH="${DDBX_DATA_PATH:-$(cd "$(dirname "$0")/.." && pwd)/../ddbx-data}"
SOURCE="$DDBX_DATA_PATH/worker/db/types.ts"
TARGET="$(cd "$(dirname "$0")/.." && pwd)/src/types/ddbx.ts"

if [ ! -f "$SOURCE" ]; then
  echo "error: canonical types not found at $SOURCE" >&2
  echo "set DDBX_DATA_PATH to your ddbx-data checkout" >&2
  exit 1
fi

# Strip everything before the first `export` line so header comments don't
# trigger drift on cosmetic changes.
strip_header() {
  awk '/^export/{found=1} found' "$1"
}

if ! diff -u <(strip_header "$SOURCE") <(strip_header "$TARGET") > /dev/null; then
  echo "drift detected between:" >&2
  echo "  canonical: $SOURCE" >&2
  echo "  copy:      $TARGET" >&2
  echo "" >&2
  diff -u <(strip_header "$SOURCE") <(strip_header "$TARGET") | head -60 >&2
  echo "" >&2
  echo "run \`npm run sync:types\` to update the copy" >&2
  exit 1
fi

echo "ddbx types in sync"
