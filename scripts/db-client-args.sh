#!/usr/bin/env bash

DB_CLIENT_ARGS=()

case "${DB_CLIENT_TLS:-disabled}" in
  disabled)
    DB_CLIENT_ARGS+=(--skip-ssl)
    ;;
  required)
    DB_CLIENT_ARGS+=(--ssl)
    ;;
  *)
    printf 'DB_CLIENT_TLS must be disabled or required\n' >&2
    exit 64
    ;;
esac
