# Tracked short links (camera#320)

One link per placement of an event (the giant screen QR, a poster, an email footer), each counted on its own, all of them reported to messmass as the
event's QR scans and link clicks. The link is `go.messmass.com/<slug>` and sends the visitor to the capture page of the event.

## What is stored

- **`short_links`**: `{slug, eventId, placement, kind, active, createdAt}`. `kind` is `qr` (a QR code, counted as scans) or `link` (a plain link, counted as
  clicks). The slug is six characters from an alphabet without look-alikes (`k7f3q2`), which keeps a QR code coarse and easy to scan; the admin can choose
  one instead. A slug is unique across tracked links, events' own short URLs and greatest-hits addresses, and the event routes refuse a short URL or a
  greatest-hits slug that a tracked link already uses. At most 20 links per event. A link is switched off, not deleted: it answers "not found", its counts stay.
- **`short_link_hits`**: one row per link, UTC day and kind of phone (`android`, `iphone`, `other`), bumped with `$inc`; there is no row per visit.
  The event's own short URL (`shortUrlSlug`) is counted into the same rows as a plain link.

## What is counted

A count is a person's browser being sent on (`GET /api/go-short/[slug]`, after the redirect is sent), not a different person: a guest who scans twice
counts twice. Not counted (`lib/short-links/device.ts`): HEAD requests, prefetches, a missing user agent, and chat-app link previews, crawlers, monitors and
command-line tools. The phone is read from the user agent: Android, iPhone (iPad and iPod too), other.

## What messmass gets

`lib/short-links/totals.ts` adds the rows of an event up to four numbers, and `lib/short-links/sync.ts` sends them to messmass
(`POST /api/integrations/camera/events/[messmassEventId]/link-stats`, messmass `lib/cameraLinkStats.ts`):

| messmass stat | what it is |
|---|---|
| `visitQrCode` | every counted visit through a `qr` link |
| `visitShortUrl` | every counted visit through a `link` link and the event's own short URL |
| `qrscanAndroid`, `qrscanIphone` | the Android and iPhone share of the `qr` visits |

messmass sets each stat to **the value it held at camera's first report plus camera's total**, so numbers typed in or imported are never overwritten; camera
sends whole totals, so a repeated or late report changes nothing. Only an event that has at least one tracked link is ever pushed.

Camera has no scheduled job (`vercel.json` has no crons; see RUNBOOK "Scheduled jobs and workers"), so the push rides on the traffic: after a counted visit,
and when the admin opens the links panel (forced). An event is pushed at most once per 30 seconds: the slot is claimed with one atomic update of
`event.shortLinkSync.pushedAt`, so visits arriving together make one push, and the totals of the last good push are kept in `shortLinkSync.totals` (nothing is
sent when nothing is new). A visit inside the window is sent by the next visit or the next time the panel is opened. A failed push is repeated at the next one.
If a final flush after the event matters, open the links panel once, or add a cron (it needs `CRON_SECRET`, an owner step).

## Admin

The event page (`/admin/events/[id]`) has a "Tracked links" panel (`components/admin/ShortLinksPanel.tsx`): the address of every link with a copy button, the
QR code as an SVG file (dark modules on a transparent background, any colour with `?color=%23rrggbb`, for the designers), the counts (total, today in UTC, and
Android / iPhone / other for QR links), a form to add a link, and a switch to turn a link off. Routes: `GET/POST/PATCH /api/admin/events/[id]/short-links`
and `GET .../[slug]/qr` (viewer to read, manager to change).

## Known limits

- Counts are visits, not unique people, and "today" is the UTC day.
- The last visits before a quiet period reach messmass at the next visit or panel opening (no cron).
- The phone split is by user agent; an in-app browser that hides it counts as `other` (and so is in `visitQrCode` but in neither `qrscan` stat).
