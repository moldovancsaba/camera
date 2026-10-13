# Guest photo framing controls

The capture flow stores the photo at the frame's aspect ratio. `components/camera/ReframeStep.tsx` lets the guest choose the crop and `lib/camera/reframe.ts` keeps the crop inside the source image.

The event's **Take Photo** page settings control three actions:

- `allowZoomOut`: let the guest show more of the source selfie, up to the fit view.
- `allowZoomIn`: let the guest zoom in beyond the default fill crop.
- `allowPan`: let the guest move the selfie within the frame.

Missing settings default to enabled, preserving the behavior of existing events. Disabled actions are constrained in pointer, touch, wheel, keyboard, segmented-control, and slider input. The displayed instructions match the available actions.

An editor sets these options on the event's Take Photo page in the journey editor. The choices are saved with `CustomPage.config`; no submission or account data changes. **AI-generated background fill is a separate feature and is not implemented**: fitting the whole selfie can expose areas outside the source image, and this app has no background-generation service to fill them.

The same page also controls which parts of the photo are visible when it is reframed; the frame's dark-area overlay remains in place and is not affected by these permissions.
