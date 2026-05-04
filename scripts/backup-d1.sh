#!/usr/bin/env bash
set -euo pipefail

DB_NAME="director-dealings"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/d1-${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"

echo "Exporting $DB_NAME (remote) → $OUT_FILE"
npx wrangler d1 export "$DB_NAME" --remote --output="$OUT_FILE"

echo "Compressing → ${OUT_FILE}.gz"
gzip -f "$OUT_FILE"

echo "Done: ${OUT_FILE}.gz ($(du -h "${OUT_FILE}.gz" | cut -f1))"
