# Fanmass results in Camera

The event’s **Photo analysis** page (`/admin/events/<eventId>/analysis`) is the Camera workbench for per-photo Fanmass results. Older `?photos=fanmass` and `?photos=analysed` links resolve to the same page. There is no separate manual-analytics tab: human review corrects or confirms the Fanmass result for that same photo.

## Ownership and workflow

1. Camera owns the submission, event/partner linkage, consent, retention, publication, and vetting decision.
2. Fanmass independently discovers eligible source photos in Atlas and processes one photo at a time. Camera does not enqueue, lease, retry, or send image bytes to Fanmass.
3. Fanmass owns queue state and the immutable analysis result, including normalized image-relative face and person boxes. It delivers one result for one photo to Messmass.
4. Camera reads Fanmass queue/results for the authorized event review UI. A reviewer can edit returned summary and analysis properties, all saved boxes, and draw/move/resize person and face boxes in the one-photo review. Camera stores the human correction against the exact source revision and analysis generation, preserves the original Fanmass output, and requires confirmation again after edits. Fanmass discovers the revision-matched review from Atlas, stores it with that photo's result, and sends the updated per-photo result to Messmass through its durable outbox. Confirmation does not approve/reject the photo.
5. Messmass owns the event report and mechanically aggregates the photo results delivered by Fanmass.

The page refreshes every 10 seconds while visible. Its event summary separates currently eligible source photos, waiting/discovered/active/completed/failed work, delivery to Messmass, vetting and consent counts, and analysis signal totals. Queue and delivery counts use the same current eligibility gate as the displayed photo list, so erased or ineligible rows do not look like active work. Each photo card shows the unframed source image analyzed by Fanmass, queue state, Fanmass people-count field, returned person, face, and brand-region boxes, other summary counts, and whether a reviewer confirmed or corrected the current result. **Review / edit Fanmass analysis** opens one image with image-relative detection boxes, all structured summary and analysis properties, saved box data, and previous/next photo navigation. The reviewer can edit every returned field through a structured editor for `summary`, `analysis`, and `boxes`, including adding/removing detections and changing person/face attributes. People and face boxes can be drawn, moved, and resized directly on the photo; brand-region boxes can be corrected in the structured editor. Camera stores this correction in the submission’s `fanmassAnalysisReview.correction` field with reviewer, timestamp, source revision, and generation; stale revisions cannot be edited. Editing clears the prior confirmation. The screen displays corrected values and retains the original Fanmass output for comparison. Fanmass pulls a matching review from Atlas and republishes that photo's result, so confirmed corrections become the values used by Messmass report aggregation.

For the displayed analysis image, Camera prefers the private unframed review crop and then a verified unframed copy. It uses `originalImageUrl` only when a `reframe` record identifies a distinct, unframed camera original. The list and one-photo editor do not fall back to `imageUrl` or `finalImageUrl`, which may include the frame.

## State labels

| Camera label | Meaning |
|---|---|
| Waiting for Fanmass | The source photo is eligible in Camera but Fanmass has not discovered it yet. |
| Queued | Fanmass has recorded the task; it is waiting for the single worker. |
| Starting / In progress | Fanmass has leased the photo or is processing it. |
| Retrying | Fanmass will retry a transient failure. |
| Fanmass analysed | The current queue generation has a completed result. |
| Result missing / Failed / Cancelled | The result cannot be reviewed as a successful current analysis. |
| Needs review / Corrected / Confirmed | Whether an event reviewer has checked this exact source revision and analysis generation. A new result generation needs a new confirmation. Human review is stored alongside the immutable AI output; Messmass uses corrected values only after confirmation. |

Rejected photos, photos with incomplete consent, photos pending erasure, and other ineligible submissions do not enter Fanmass’s analysis queue. The page shows these counts separately where useful; it never treats an unreadable Fanmass database as a successful or failed analysis.

## Per-photo fields Fanmass currently returns to Camera

Camera reads the identity-free result envelope stored by Fanmass. The review page presents the returned summary and analysis properties in labeled, structured sections, with an explicit raw JSON diagnostic view and saved boxes:

- **Photo-level summary:** person count, real-person count, display-person count, approximate crowd estimate, scene type, smiling count, and smiling percentage.
- **Face detections:** each face’s normalized image-relative box, ID, confidence, and smile indicator.
- **People detections:** each person’s normalized box, gender estimate, estimated age, emotion estimate, real/display subject type, confidence, smile indicator, cap/hat indicator, and glasses indicator.
- **Aggregate demographics:** gender counts, age histogram, emotion counts, and cap/glasses accessory counts.
- **Poster/display context:** whether display media was found, display type, real/display person counts, exclusion state, and exclusion reason when supplied.
- **Content moderation:** flagged state, severity (`none`, `low`, `medium`, `high`), category detections, confidence and detail per category, flags, and summary. Categories are nudity, sexual content, middle finger, hate symbols, hate words, alcohol, drugs, violence, weapons, and other.
- **Sports merchandise and entities:** detected item names and short names, entity type (club, federation, league, national team, sponsor, or other), sport, item type (jersey, kit, scarf, cap, flag, banner, logo, or other), confidence, visible detail, aggregate entities, detection state, and summary.
- **Commercial brand appearances:** brand name and short name, category (luxury, sportswear, streetwear, fast fashion, outdoor, or other), item type (clothing, shoes, bag, accessory, logo, or other), confidence, visible detail, aggregate brands, detection state, and summary.
- **Result provenance:** analysis stage/depth, analysis timestamp, source revision, and generation. These fence stale results and keep human confirmation tied to the exact version reviewed.

The estimate and the boxes are different measurements. The image-level person estimate can include a crowd estimate; the person-box count only counts individually boxed people. They must not be presented as interchangeable totals.

## Fanmass capabilities outside this Camera result contract

Fanmass has other modules for local/batch work, including template matching, poster-region teaching, region feedback, marketing signals, and statistical forecasts/projections. They are not all part of the required Camera single-photo contract. The Camera worker contract currently requires scan, face detection, people/demographics, poster/display detection, moderation, sports merchandise, fashion-brand detection, and brand-region scanning. Camera’s result screen must not imply that an optional batch/report capability ran on every Camera photo.

## Count interpretation

The dashboard counts source submissions, approved/rejected decisions, consent/retention eligibility, Fanmass queue states, completed current results, and Messmass delivery states separately. `Fanmass analysed` is the count of current completed per-photo results, not the number of all Camera submissions. A report showing fewer analyzed photos than submissions is expected when some photos are rejected, await required consent, or have not yet been discovered/processed. Any unexplained difference in Camera source records must be investigated as a separate retention/deletion reconciliation; it must not be inferred from Fanmass report totals.
