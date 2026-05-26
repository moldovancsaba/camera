# Try-On Operations

## Required environment

```bash
MONGODB_URI=...
MONGODB_DB=...
IMGBB_API_KEY=...
CAMERA_TRYON_INTERNAL_SECRET=...
CAMERA_TRYON_COMPLETE_URL=https://camera.example.com/api/internal/tryon/complete
```

## Setup

1. Verify Camera-side prerequisites:

```bash
npm run tryon:verify
```

2. Seed the suit catalog in Camera:

```bash
npm run tryon:seed-suits -- config/leather-suits.example.json
```

3. Ensure indexes:

```bash
npm run db:ensure-indexes
```

4. Copy the worker env template on the try-on machine:

```bash
cd /Users/Shared/Projects/try-on
cp .env.tryon-worker.example .env.tryon-worker
```

5. Verify the try-on worker setup:

```bash
cd /Users/Shared/Projects/try-on
./.venv311/bin/python scripts/verify_tryon_worker_setup.py
```

6. Start the local worker from `/Users/Shared/Projects/try-on`:

```bash
cd /Users/Shared/Projects/try-on
./.venv311/bin/python scripts/tryon_queue_worker.py
```

## Expected worker behavior

- polls Atlas
- recovers stale leased jobs
- claims one job
- stages assets locally
- runs the processor
- uploads the result to imgbb
- calls Camera’s internal completion endpoint
- leaves the generated result in `pending_review`
- archives the local workspace

## Recovery model

- transient failures move to `retry_wait`
- permanent failures move to `failed`
- stale leased jobs are reset to `retry_wait`
- completion creates a derived try-on submission in `pending_review`
- admin approval is required before a generated result appears on share pages or slideshows

## Logs and local artifacts

Worker logs are written under:

```text
$TRYON_QUEUE_ROOT/logs
```

Per-job workspaces include:
- `person_input.jpg`
- `suit_input.png`
- `result.png`
- `metadata.json`
- `log.txt`

## Operational warnings

- The worker expects `TRYON_SUIT_ASSET_ROOT` to contain the referenced suit assets locally.
- Source image host validation defaults to `i.ibb.co`.
- The queue contract assumes Camera has already saved the normal submission before try-on enqueue runs.
- The official worker runtime now lives in `/Users/Shared/Projects/try-on`, not in the Camera repo.
