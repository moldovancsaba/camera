# Email template verification

Event result email setups support three delivery modes:

- `after_save`: send immediately when the saved result is ready.
- `after_related`: send when the share page has the configured related photos available.
- `after_tryon_resubmission_approved`: send an update after an admin-approved try-on rerun result.

Supported placeholders:

- `{name}`: participant display name.
- `{event}`: event name.
- `{link}`: public share page URL.
- `{terms}`: event terms and conditions URL.

Use `POST /api/admin/events/{eventMongoId}/email-preview` to render and validate templates without sending email. Omit `templateType` to validate the full matrix, or pass one of the delivery modes above. Optionally pass `sampleSubmissionId` to preview with a real submission context.

The preview endpoint returns `validations[]` with `missingPlaceholders`, `missingValues`, `warnings`, `renderedSubject`, and `renderedBodyPreview`. It never calls the email provider and never mutates submission email flags.
