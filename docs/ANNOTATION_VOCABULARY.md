# Rejection reason vocabulary

**Current status, 2026-10-22:** this editor configures only structured reasons for rejecting a photo from publication. Gender, age, emotion, and merchandise were part of a former manual annotation system that has been retired. Per-photo image analytics now come from Fanmass and are reviewed, corrected, or confirmed in Camera's Photo analysis page; they do not use this vocabulary. See [FANMASS_RESULTS_IN_CAMERA.md](FANMASS_RESULTS_IN_CAMERA.md).

## Current behavior

The rejection reason list inherits from the standard vocabulary to the general, partner, and event levels. The nearest saved level takes precedence; unchanged options continue to inherit. Global admins edit the general list, partner managers edit a partner's list, and event managers edit an event's list through `components/admin/AnnotationVocabularyEditor.tsx` and `GET/PUT /api/annotation-vocabulary?level=&id=`.

Each reason has a stable key and editable label. A photo stores selected reason keys in `Submission.rejectReasons` and the review history. A rejected photo must have at least one currently offered reason. Reopening or approving a previously rejected photo removes its current reason selection while preserving the historical decision entry. Reasons explain publication moderation; they do not label people or train Fanmass.

The standard reason keys are:

| Key | Default label |
|---|---|
| `offensive_gesture` | Offensive hand gesture |
| `nudity` | Nudity or sexual content |
| `alcohol` | Alcohol |
| `forbidden` | Other forbidden content |
| `violence` | Violence or weapons |
| `hate` | Hate symbol or offensive text |
| `drugs` | Drugs or smoking |
| `competitor_brand` | Competitor or unwanted brand |
| `political` | Political message |
| `poor_quality` | Unusable: blurry, dark or no face |
| `spam_test` | Test, spam or not a selfie |
| `other` | Other (write it in the note) |

Camera's Messmass counter for a structured reason is `camera_rejected_<key>` (for example, `camera_rejected_nudity`). It counts current rejected photos carrying that reason. A photo with several selected reasons appears in each relevant total. No counter is sent for reason values when the event has no currently rejected photos. See [ANALYTICS.md](ANALYTICS.md).

## Legacy configuration

The shared vocabulary parser still recognizes legacy `gender`, `age`, `emotion`, and `merch` option groups so old documents can be read without corrupting unrelated event configuration. The current editor does not render those groups, the current API does not write manual per-photo annotations, Camera analytics do not count those keys, and Fanmass results do not derive from them. Legacy option configuration is not a supported way to change Fanmass labels.

Legacy `Submission.people` and `Submission.peopleReview` photo data is not part of the current TypeScript model or runtime analytics flow. Production deletion of any such residual fields must be verified separately against an authenticated database inventory; do not assume a missing schema type proves the live database is clean.
