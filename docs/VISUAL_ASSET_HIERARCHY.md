# Visual assets and experience defaults

Status: inheritance and experience-template runtime are implemented. Issue #753 adds a read-only legacy inventory; no historical data has been migrated or production inventory run.

## Product model

Camera has two related but separate inheritance systems:

1. **Asset catalogs** contain logos, frames and images. A child can use an ancestor asset only while each parent makes it available.
2. **Experience templates** are identity-free snapshots of reusable guest-page configuration. They do not copy partner/event identity, consent receipts, submissions, analytics or photo data.

Both move in one direction: **Global → Partner → Event**. A child can hide an available inherited asset locally. A child cannot restore an asset that a parent has disabled or stopped forwarding. Hiding is a visibility choice; it does not delete media or remove a child’s existing assignment.

## Asset visibility and sharing

| Source | Can be used at | How it reaches the next level |
| --- | --- | --- |
| Global | Partner and event | Global owner marks it shared; each partner can hide it or stop forwarding it; each event can hide it. |
| Partner | Its events | Partner marks it shared with events; each event can hide it. |
| Event | That event only | Never forwarded. |

An inactive source asset is unavailable to new selections and public event responses. Existing assignments remain stored so a later reactivation can restore them. A parent hide, disabled source or forwarding block takes precedence over descendant choices. New library uploads start private to their source level until explicitly shared. The source-owned `shareToChildren` switch is enforced at both boundaries even for legacy partner catalogs: Global → Partner and Partner → Event.

Partner and event local-hide controls also work for existing partners. The first local policy action safely upgrades that partner's legacy catalog: Camera records local hides for global assets the partner could not previously see, then enables the inherited catalog. This preserves the partner's effective catalog before applying the requested hide or forwarding choice. Existing event-level visibility actions use the same transition. The explicit “Enable inherited catalog” control remains available for a manager who wants to opt in without changing one asset.

The library pages expose the same policy for logos, frames and images. Global asset sharing is managed by global admins. Partner pages can hide global assets for that partner, stop forwarding global assets to events, and share partner-owned uploads with events. Event pages can hide inherited frames and images; logos and tagged pictures can be replaced, supplemented or set to “show nothing” in their place-of-use slot. These actions are authorized by the existing global or partner workspace roles.

## Experience-template resolution

The allow-listed fields are `customPages`, `visualSettings`, `sharePage`, `frameSelection`, `frameSelectionTiles`, `welcomeScreenComposition` and `frameMessageSelectionDisplay`. Template creation rejects unsupported top-level fields, non-JSON values, excessive nesting, payloads over 512 KB, and forbidden identity/consent/photo-data keys. It also refuses a known Camera library image that is inactive, private, owned by a different child, or not present in the target level's catalog. External HTTPS artwork not registered in Camera's libraries remains supported.

The runtime order is:

1. Global default template, if configured.
2. Partner default template, if the partner follows the global default or selects its own. A partner-specific template overlays the global template field by field.
3. Event overrides saved on that event.

An event can instead select its own event template, which starts an independent chain, or explicitly keep its local setup by opting out. A partner can follow the global default, select its own template, or disable the inherited global default. Missing selections on pre-existing events preserve their current stored configuration; new and provisioned events start in inherit mode. Inherited configuration is resolved at read time rather than copied into child records.

| API | Purpose |
| --- | --- |
| `GET /api/visual-assets/templates?level=global` | List global templates; global admins only. |
| `POST /api/visual-assets/templates` | Snapshot an authorized source event into an identity-free template at global, partner or event level. |
| `PATCH/DELETE /api/visual-assets/templates/<templateId>` | Rename or delete an unreferenced template; selected templates cannot be deleted. |
| `GET/PATCH /api/visual-assets/templates/default` | Read or set/clear the service-wide default; global admins only. |
| `GET/PATCH /api/partners/<id>/experience-template` | Read or set a partner default, inherit the global default, or disable it. |
| `GET/PATCH /api/events/<id>/experience-template` | Read or set event inherit, local template, legacy/local opt-out. |

## Runtime safety and operations

- Admin templates are not included in public responses. `GET /api/events/<id>?audience=guest` resolves only the approved configuration, filters unavailable known library URLs, and removes selection metadata before returning the event.
- Editing event configuration while inheritance is enabled records field-level overrides; switching the selected template intentionally resets overrides tied to the old selection.
- Template writes are bounded by the normal admin rate limit, validate ownership and role, and return explicit 4xx errors for invalid or unavailable selections. Reads are bounded to 200 templates per owner. MongoDB uses a unique `templateId` index.
- There is no background job, retry loop or external service in this feature. A failed request is safe to retry. Default changes are immediate for children still following that parent; locally selected templates and event overrides remain independent.
- Rollback is level-specific: clear the global default; set a partner to `null` to disable global inheritance or remove its field to follow global; set an event to `{ mode: 'template', templateId: null }` to keep its local configuration, or remove the selection to restore the legacy read path. Unreferenced templates may be deleted. The asset version-2 policy can be reverted by clearing the partner's `visualAssetPolicy`; do not do this after child-specific policies have been added without first exporting those policies.
- No historical partner migration runs automatically. The partner UI opt-in preserves each partner's current visible set by writing local hides. Production enablement and a backfill require separate inventory, dry run, backup and operator review.

## Legacy inventory gate (issue #753)

`npm run visual-assets:legacy-inventory` is a read-only, PII-minimized dry run. It requires the operator to provide `CAMERA_VISUAL_ASSET_MIGRATION_READONLY_URI` and `CAMERA_VISUAL_ASSET_MIGRATION_DB` explicitly. The command does not load `.env`, read the app's normal `MONGODB_URI`, or offer an apply mode. Use an account that has read-only permissions on the selected database. The command reads a single MongoDB snapshot serially, with a 50,000-document and 64 MiB projected-data ceiling; it stops with `inventory_limit_exceeded` if either bound is reached.

The report covers frames, logos, images, partner/event catalogs and assignments, local visibility policies, direct picture fields, slideshow/landing/layout artwork, and experience-template records and selections. It includes stable business IDs and SHA-256 digests, not raw image URLs or participant/contact fields. A JSON copy can be written to a new file with `--output=/secure/path/report.json`; the file is created exclusively with owner-only permissions. Each query has a 30-second server limit; the full snapshot is capped at four minutes to stay within MongoDB's default snapshot history window. Exit code `0` means no unresolved reference/ownership findings, `2` means findings need disposition, and `1` means configuration or inventory execution failed.

`outputComparison.status: equivalent-by-contract` only means the proposed missing asset fields match the current legacy runtime defaults. `renderedEventOutputDiff.status` remains `not-run`: no event before/after rendering is claimed. This command proposes explicit values for legacy asset scope/activity/sharing only. It does not enable policy version 2, alter assignments or templates, move media, or write checkpoints. There is no apply or rollback implementation in this phase. Do not normalize production records until a reviewed report, backup, representative rendered-output diff, and separately reviewed bounded apply/rollback design are available. No production inventory has been run by this code change.

## Accessibility and verification

Admin controls use the Camera GDS packages and `SemanticButton` action vocabulary. The selectors have visible labels; loading and save errors use GDS state/alert components; confirmations are keyboard-accessible GDS dialogs. UI language resolves through the existing 23-locale admin operation catalog. Browser verification must cover desktop and narrow viewport, keyboard-only selection, focus return from confirmation, screen-reader labels, loading/error/success states and immediate guest resolution after a default change.

Automated coverage includes pure visibility rules, library preservation and template-resolution tests. Before release, run:

```bash
npm run inventory:check
npm run release:check
```

Do not enable the new catalog contract on existing production partners until a read-only inventory and dry-run report confirm that the generated hides preserve each current partner/event experience.
