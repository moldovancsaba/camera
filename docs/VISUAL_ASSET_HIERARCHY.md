# Visual assets and experience defaults

Status: maintained architecture reference. Journey inheritance rules are detailed in [Global, Partner and Event User Journeys](GLOBAL_DEFAULT_JOURNEY.md).

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

Journey flow is selected as one named version at a time. `customPages`, `defaultPageOrders`, `sharePage` and `frameMessageSelectionDisplay` are the journey fields. `visualSettings`, frame assignments, welcome artwork, logos, colors and other presentation/media configuration remain owned by the partner or event and are not merged from a journey template. Template parsing retains an allow-list for backwards compatibility, but the runtime projects stored templates to the journey fields so legacy presentation fields cannot leak into a guest response.

Runtime resolution is strictly replacement-based:

1. A valid selected Event User Journey (EUJ) is used for that event.
2. Otherwise, the event follows the partner's selected Partner User Journey (PUJ).
3. If the partner has no selected PUJ, the event follows the one selected Global User Journey (GUJ).

No parent/child journey fields are overlaid. Partners can select one PUJ or follow the global default; events can select one EUJ or follow the partner's current default. Child selections remain independent from future parent changes, while inheriting children see the currently selected parent version at read time. New partners/events start by inheriting. Pre-template events with saved `customPages` remain on their legacy journey until an editor snapshots that setup into a named EUJ; the selector API prevents switching directly to inheritance before that preservation step.

Template creation rejects unsupported top-level fields, non-JSON values, excessive nesting, payloads over 512 KB, and forbidden identity/consent/photo-data keys. A created version does not change the selected default (except the first valid GUJ is made default when the system has none). Global snapshots remove source-client copy, consent/identity page content, CTA destinations, artwork and branding; blank generic copy resolves in the destination event's language. Destination partner/event media and style remain local.

The selected or inherited journey is returned by the event API and is the flow opened by the stable capture URL, short link and QR codes. Changing a selection leaves those addresses unchanged. Public event responses omit admin selection metadata. A first edit to inherited event flow creates a named EUJ before storing changes; editing a selected named journey changes only that named version. Partner and global editing is scoped to the named version at that level.

| API | Purpose |
| --- | --- |
| `GET /api/visual-assets/templates?level=global` | List global templates; global admins only. |
| `POST /api/visual-assets/templates` | Snapshot an authorized source event into an identity-free template at global, partner or event level. |
| `PATCH/DELETE /api/visual-assets/templates/<templateId>` | Rename or delete an unreferenced template; selected templates cannot be deleted. |
| `GET/PATCH /api/visual-assets/templates/default` | Read or set the required service-wide GUJ default; global admins only. |
| `GET/PATCH /api/partners/<id>/experience-template` | Read or set one PUJ default, or follow the required global default. |
| `GET/PATCH /api/events/<id>/experience-template` | Read or set one EUJ, or inherit the partner's current default. |

## Runtime safety and operations

- Admin selection metadata is not included in public responses. `GET /api/events/<id>?audience=guest` resolves one selected/inherited flow, keeps presentation/media from the event, filters unavailable known library URLs, and removes selection metadata. Existing capture, short-link and QR addresses continue to serve the selected flow.
- Journey field edits never become field-level inheritance overlays. Editing an inherited event first forks its effective flow into a named EUJ. Presentation updates stay in their existing event-owned fields.
- Template writes are rate-limited and validate ownership and role. Invalid or unavailable selections return explicit errors. MongoDB uses a unique `templateId` index; list APIs return all versions for the owner.
- No background job, retry loop or external service is involved. A failed request can be retried. Parent default changes immediately affect only descendants still inheriting; child-selected templates remain independent.
- Rollback is selection-based: partners can return to the GUJ by choosing **Follow the global default**; events can return to the current partner/GUJ chain by selecting **Use parent default**. There is no disabled global default and no null-template sentinel. To delete a version, change every reference first; deletion rechecks references and returns 409 while selected. Existing legacy event pages stay intact until a named EUJ is created and selected or the parent default is chosen.
- The asset version-2 policy can be reverted by clearing the partner's `visualAssetPolicy`; do not do this after child-specific policies have been added without first exporting those policies.
- No historical partner migration runs automatically. The partner UI opt-in preserves each partner's current visible set by writing local hides. Production enablement and a backfill require separate inventory, dry run, backup and operator review.

## Accessibility and verification

Admin controls use the Camera GDS packages and `SemanticButton` action vocabulary. The selectors have visible labels; loading and save errors use GDS state/alert components; confirmations are keyboard-accessible GDS dialogs. UI language resolves through the existing 23-locale admin operation catalog. Browser verification must cover desktop and narrow viewport, keyboard-only selection, focus return from confirmation, screen-reader labels, loading/error/success states and immediate guest resolution after a default change.

Automated coverage includes pure visibility rules, library preservation and template-resolution tests. Before release, run:

```bash
npm run inventory:check
npm run release:check
```

Do not enable the new catalog contract on existing production partners until a read-only inventory and dry-run report confirm that the generated hides preserve each current partner/event experience.
