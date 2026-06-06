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

### Canonical body style

Template bodies should use the exact grammar and ordering below. This is the standard enforced in onboarding/validation flows:

```text
Hi {name},

Thank you for enjoying the {event} experience.

Your photo is ready. Don't forget to share it on your social media!
{link}

AI is fun, but it can make mistakes. If you want to make a new image, feel free to come back to us.

Wishing you an unforgettable time at {event}.

Policies and General Terms and Conditions:
{terms}
```

For rerun-approved updates, the default subject and body are:

```text
Hi {name},

Thank you for enjoying the {event} experience.

Your updated photo is ready. Don't forget to share it on your social media!
{link}

AI is fun, but it can make mistakes. If you want to make a new image, feel free to come back to us.

Wishing you an unforgettable time at {event}.

Policies and General Terms and Conditions:
{terms}
```

The phrase "your event" in legacy templates is intentionally normalized to `{event}` for consistency.

Use `POST /api/admin/events/{eventMongoId}/email-preview` to render and validate templates without sending email. Omit `templateType` to validate the full matrix, or pass one of the delivery modes above. Optionally pass `sampleSubmissionId` to preview with a real submission context.

The preview endpoint returns `validations[]` with `missingPlaceholders`, `missingValues`, `warnings`, `renderedSubject`, and `renderedBodyPreview`. It never calls the email provider and never mutates submission email flags.
### Supported placeholders
