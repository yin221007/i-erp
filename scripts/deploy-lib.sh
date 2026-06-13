#!/usr/bin/env bash

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_env() {
  local name
  for name in "$@"; do
    [[ -n "${!name:-}" ]] || die "Missing required environment variable: $name"
  done
}

require_command() {
  local name
  for name in "$@"; do
    command -v "$name" >/dev/null 2>&1 || die "Required command not found: $name"
  done
}

verify_snapshot() {
  local snapshot_dir="$1"
  local required_file
  [[ -d "$snapshot_dir" ]] || die "Snapshot directory not found: $snapshot_dir"
  for required_file in \
    complete \
    metadata.json \
    database.sql.gz \
    uploads.tar.gz \
    table-counts.tsv \
    manifest.sha256; do
    [[ -f "$snapshot_dir/$required_file" ]] ||
      die "Snapshot is incomplete: missing $required_file"
  done
  (
    cd "$snapshot_dir"
    sha256sum --check manifest.sha256
  )
}

manifest_digest() {
  sha256sum "$1/manifest.sha256" | awk '{ print $1 }'
}

verify_restore_drill() {
  local snapshot_dir="$1"
  local marker="$snapshot_dir/restore-drill.ok"
  local expected_digest
  verify_snapshot "$snapshot_dir"
  [[ -f "$marker" ]] || die "Restore drill marker is missing: $marker"
  grep -qx 'status=success' "$marker" ||
    die "Restore drill marker does not report success"
  expected_digest="$(manifest_digest "$snapshot_dir")"
  grep -qx "manifest_sha256=$expected_digest" "$marker" ||
    die "Restore drill marker does not match the current snapshot manifest"
}

confirm_gate() {
  local variable_name="$1"
  local expected_value="$2"
  local prompt="$3"
  local actual_value="${!variable_name:-}"

  if [[ "$actual_value" == "$expected_value" ]]; then
    return 0
  fi
  if [[ ! -t 0 ]]; then
    die "$variable_name must equal $expected_value"
  fi
  printf '%s\nType %s to continue: ' "$prompt" "$expected_value"
  read -r actual_value
  [[ "$actual_value" == "$expected_value" ]] ||
    die "Confirmation did not match"
}

wait_for_health() {
  local url="$1"
  local attempts="${2:-30}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --fail --silent --show-error "$url" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  die "Health check did not become ready: $url"
}

database_count() {
  local database_name="$1"
  local table_name="$2"
  mariadb \
    --batch \
    --skip-column-names \
    --host="$DB_HOST" \
    --port="${DB_PORT:-3306}" \
    --user="$DB_USER" \
    --password="$DB_PASSWORD" \
    "$database_name" \
    --execute="SELECT COUNT(*) FROM \`$table_name\`"
}

compare_table_counts() {
  local snapshot_dir="$1"
  local database_name="$2"
  local table_name expected_count actual_count
  while IFS=$'\t' read -r table_name expected_count; do
    [[ "$table_name" =~ ^[A-Za-z0-9_]+$ ]] ||
      die "Invalid table name in snapshot: $table_name"
    [[ "$expected_count" =~ ^[0-9]+$ ]] ||
      die "Invalid table count for $table_name"
    actual_count="$(database_count "$database_name" "$table_name")"
    [[ "$actual_count" == "$expected_count" ]] ||
      die "Table count mismatch for $table_name: expected $expected_count, got $actual_count"
  done < "$snapshot_dir/table-counts.tsv"
}

expected_upload_count() {
  node -e "
    const metadata = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    if (!Number.isSafeInteger(metadata.uploadFileCount) || metadata.uploadFileCount < 0) {
      process.exit(65);
    }
    process.stdout.write(String(metadata.uploadFileCount));
  " "$1/metadata.json"
}

compare_upload_count() {
  local snapshot_dir="$1"
  local uploads_dir="$2"
  local expected_count actual_count
  expected_count="$(expected_upload_count "$snapshot_dir")"
  actual_count="$(find "$uploads_dir" -type f | wc -l | tr -d ' ')"
  [[ "$actual_count" == "$expected_count" ]] ||
    die "Upload count mismatch: expected $expected_count, got $actual_count"
}
