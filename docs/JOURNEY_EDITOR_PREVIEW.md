# Journey editor live preview

## Purpose

The shared Global, Partner, and Event journey editor provides an editable page form beside a live guest-page preview. The preview is derived from the current unsaved form state, so edits appear immediately without saving the journey first.

## Layout and controls

- Desktop widths above 900px show page settings and the preview in two columns inside the full-width editor dialog.
- At 900px and below, the editor stacks the settings and preview vertically. The modal and its content remain scrollable on small screens.
- The preview size selector offers Mobile, Tablet, and Desktop stage proportions.
- Page types with an existing guest renderer reuse it. Camera, Submit, and frame/message-selection runtime steps use a clear preview placeholder because those flows require live device, submission, or selection state.
- Changing page settings or Welcome composition fields updates the preview from the same draft object used by Save Page.

## Safety and limitations

The preview is visual and read-only. Its guest-renderer subtree is inert; preview-aware page components also suppress navigation, analytics actions, camera entry, and submission side effects. It does not create a submission or record consent. To test the complete runtime flow, use the event's capture URL in a separate browser session and an explicitly designated test event.

The preview reflects the current page draft, the available event theme, and the resolved Welcome screen image. It does not simulate downstream server state, authentication, camera permissions, email delivery, vetting, or a successful photo upload. Placeholder steps are not screenshots of those runtime interactions.

## Accessibility

The preview size control has a visible label. Preview content is inert and cannot take keyboard focus or activate links and controls. The editor remains the interactive source of truth; the preview is not a second editing surface.

## Implementation map

- `components/admin/CustomPagesManager.tsx` builds the draft used by both preview and save.
- `components/admin/JourneyPagePreview.tsx` selects a guest renderer or a runtime-step placeholder and applies the selected preview dimensions.
- `components/admin/CustomPagesManager.module.css` owns the responsive two-column and stacked layouts.
- Capture renderers accept a `preview` prop to avoid runtime effects while preserving their guest-facing composition.

## Verification

The journey editor browser check verifies that the editor has two columns at desktop width, live title edits appear in the preview before saving, and the columns stack at a narrow viewport. The full repository release gate and GitHub `Verify` check remain the release gates.
