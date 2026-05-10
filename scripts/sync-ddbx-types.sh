#!/usr/bin/env bash
# Copy the canonical Dealing types from ddbx-data into this repo.
# Run after pulling type changes in ddbx-data, or when CI flags drift.
#
# Assumes ddbx-data is cloned alongside ddbx-site:
#   ~/ddbx-site/
#   ~/ddbx-data/
# Override with DDBX_DATA_PATH=/path/to/ddbx-data.

set -euo pipefail

DDBX_DATA_PATH="${DDBX_DATA_PATH:-$(cd "$(dirname "$0")/.." && pwd)/../ddbx-data}"
SOURCE="$DDBX_DATA_PATH/worker/db/types.ts"
TARGET="$(cd "$(dirname "$0")/.." && pwd)/src/types/ddbx.ts"

if [ ! -f "$SOURCE" ]; then
  echo "error: canonical types not found at $SOURCE" >&2
  echo "set DDBX_DATA_PATH to your ddbx-data checkout" >&2
  exit 1
fi

cat > "$TARGET" <<'HEADER_EOF'
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DO NOT EDIT — generated copy of ddbx-data/worker/db/types.ts
//
// The canonical source lives in the ddbx-data repo. To update this file, run
// `npm run sync:types` from a checkout of ddbx-site that has ddbx-data cloned
// alongside it (../ddbx-data). CI runs `npm run check:types` to fail builds
// if this file drifts from the canonical.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HEADER_EOF
tail -n +4 "$SOURCE" >> "$TARGET"

echo "synced $TARGET from $SOURCE"
