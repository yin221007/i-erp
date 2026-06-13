# iERP Release Qualification

## Release

- Version:
- Commit:
- Date:
- Operator:
- Synology host:
- Lucky public URL:
- Old stack port:
- Candidate stack port:

## Snapshot And Clone

- Source snapshot ID:
- `complete` marker verified:
- SHA-256 manifest verified:
- Restore drill marker verified:
- Clone database:
- Clone uploads path:
- Source/clone table counts equal:
- Source/clone upload count equal:
- Source/clone upload bytes equal:

## Compatibility

- Every active original account logged in with original password:
- Multi-device sessions:
- Administrator logout revokes only selected session:
- Normal-user permissions:
- Cross-user email/AI isolation:

## Business Smoke Tests

- Projects and workflow:
- Production progress:
- Clients and equipment:
- Schedule and work logs:
- Payments and approvals:
- Chat and announcements:
- Upload and download:
- Email receive/send/attachment:
- DeepSeek models and streaming:
- Recycle delete/restore:
- User preferences:

## Build And Runtime

- `scripts/verify-release.sh`:
- Blue Compose config:
- Green Compose config:
- Backend readiness:
- Frontend readiness:
- Container memory limits observed:
- Production dependency audit:

## Rollback Rehearsal

- Upgrade snapshot ID:
- Green failure injected:
- Database restored:
- Uploads restored:
- Old stack started:
- Original accounts logged in:
- Old-version business smoke tests:
- Lucky old target verified:

## Decision

- Approved for cutover:
- Approver:
- Cutover time:
- Seven-day rollback retention ends:
- Notes:
