# Try-On Operations

## Scope

This document describes the Camera-side operational boundary for try-on jobs without exposing deployment secrets, provider endpoints, private machine paths, or event-specific presets.

## Required configuration

Keep all runtime values in deployment or local environment variables. Do not commit real credentials, callback URLs, provider model IDs, or machine-local paths.

Required groups:

- Camera database connection
- media upload credentials
- internal worker callback URL
- shared internal callback secret
- queue and catalog collection names
- optional external processor credentials
- local worker storage paths

## Setup flow

1. Verify Camera-side try-on prerequisites with the package script.
2. Seed or manage the suit catalog through the Camera admin surface or a controlled import script.
3. Ensure database indexes before live queue processing.
4. Configure the worker from its private environment template.
5. Start the worker from the try-on repository using the local runtime documented in the private ops runbook.

## Internal callbacks and periodic sync

The worker reports completion and final failure to Camera through authenticated internal callbacks configured by environment variable.

The recovery sync path is idempotent and may be run periodically or manually to materialize missing derived submissions after a worker-side upload or callback interruption.

The sync path:

- keeps queue job metadata current
- creates missing derived result submissions
- reapplies frame overlays when the event requires framed returned results
- updates derived URLs and metadata when corrected outputs are detected

## Expected worker behavior

- polls the configured queue
- recovers stale leased jobs
- claims one job at a time
- stages assets locally
- runs the selected processor profile
- uploads the result to the configured media host
- calls Camera’s internal completion callback
- leaves generated results in review state
- archives local per-job workspace artifacts

## Camera operator surfaces

Camera exposes admin surfaces for queue state, suit catalog management, active vetting, approved archives, rejected archives, failed jobs, and greatest-hit selections. Keep exact deployment URLs out of committed docs.

## Catalog management boundary

- Camera owns suit title, description, active state, and the uploaded suit asset.
- The worker downloads the suit image from the catalog record before processing.
- File-system suit roots are legacy fallbacks only and should not be required for current catalog records.

## Recovery model

- transient failures move to retry state
- permanent failures move to failed state
- admins can requeue recoverable failed or retry jobs
- stale leased jobs are reset for retry
- completion creates a derived result submission in review state
- admin approval is required before generated results appear publicly
- review decisions archive the result out of active vetting

## Logs and local artifacts

Worker logs and per-job workspaces must remain on the worker machine or private log storage. Do not commit paths, generated inputs, generated outputs, or per-job metadata.

Per-job workspace contents may include source input, suit input, result image, metadata, and logs.

## Operational warnings

- Source host validation should stay narrow.
- The queue contract assumes Camera saved the normal submission before enqueueing try-on.
- Keep the worker runtime path and host-specific commands in private ops notes, not in this repository.
- Rotate shared callback secrets when worker ownership or deployment ownership changes.
