# Landing Page CSS Handoff

## General Rules

1. The landing page is a full-screen responsive campaign page.
2. The page can render in portrait, square, or landscape.
3. The slideshow or slideshow layout is the hero element.
4. All visual presentation should be controlled from the landing page CSS.
5. The app provides stable structural class names and state classes.
6. The app does not add a later competing landing-page override after the custom CSS.
7. Custom landing-page CSS is the final style layer for the landing page.

## Root Element

Root class:
- `.landing-page-root`

Possible root state classes:
- `.landing-page--has-sidebar`
- `.landing-page--no-sidebar`
- `.landing-page--has-cta`
- `.landing-page--no-cta`
- `.landing-page--has-logo`
- `.landing-page--no-logo`
- `.landing-page--has-description`
- `.landing-page--no-description`
- `.landing-page--has-qr`
- `.landing-page--no-qr`
- `.landing-page--has-legal`
- `.landing-page--no-legal`
- `.landing-page--target-layout`
- `.landing-page--target-slideshow`

The saved custom CSS class name is also applied on the same root element.

## Exact Element Hierarchy

```text
main.landing-page-root
  div.landing-page-shell
    header.landing-page-header
      section.landing-page-copy
        img.landing-page-logo
        OR
        img.landing-page-logo.landing-page-logo--portrait-placement
        h1.landing-page-title
        p.landing-page-description
        div.landing-page-cta-container
        OR
        div.landing-page-cta-container.landing-page-cta-container--portrait-placement
          div.landing-page-actions
            optional:
              div.landing-page-cookie-consent
                label.landing-page-cookie-row
                  input.landing-page-cookie-checkbox
                  span.landing-page-cookie-copy
                button.landing-page-cookie-button
            optional:
              a.landing-page-url-button
              or
              a.landing-page-url-button.landing-page-url-button--disabled

    section.landing-page-main
    OR
    section.landing-page-main.landing-page-main--with-sidebar
    OR
    section.landing-page-main.landing-page-main--without-sidebar

      div.landing-page-media-column
        div.landing-page-media-fit
          div.landing-page-media-frame
            iframe.landing-page-media-iframe

      optional:
      aside.landing-page-sidebar
        optional:
          section.landing-page-sidebar-qr
            div.landing-page-sidebar-qr-frame
              img.landing-page-sidebar-qr-image

        optional:
          section.landing-page-sidebar-cta.landing-page-cta-container--sidebar-placement
            div.landing-page-actions
              optional:
                div.landing-page-cookie-consent
                  label.landing-page-cookie-row
                    input.landing-page-cookie-checkbox
                    span.landing-page-cookie-copy
                  button.landing-page-cookie-button
              optional:
                a.landing-page-url-button
                or
                a.landing-page-url-button.landing-page-url-button--disabled

        optional:
          section.landing-page-sidebar-logo
            img.landing-page-logo.landing-page-logo--sidebar-placement

        optional:
          section.landing-page-sidebar-legal
            h2.landing-page-legal-title
            div.landing-page-legal-links
              optional:
                a.landing-page-legal-link.landing-page-legal-link--terms
              optional:
                a.landing-page-legal-link.landing-page-legal-link--privacy
```

## Element Definitions

1. `.landing-page-root`
- Full page wrapper.
- Holds overall background, typography system, and major theme variables.

2. `.landing-page-shell`
- Full-height inner shell.
- Controls overall page padding, internal spacing, and viewport fit.

3. `.landing-page-header`
- Top section of the page.
- Contains branding, title, description, and portrait CTA area.

4. `.landing-page-copy`
- Vertical content stack inside the header.
- Holds logo, title, description, and portrait CTA.

5. `.landing-page-logo`
- Base logo image element.
- Shared logo styling should go here.

6. `.landing-page-logo--portrait-placement`
- Portrait/top logo placement variant.

7. `.landing-page-logo--sidebar-placement`
- Landscape/square sidebar logo placement variant.

8. `.landing-page-title`
- Main title text.

9. `.landing-page-description`
- Optional supporting description text.

10. `.landing-page-cta-container`
- Base CTA container.

11. `.landing-page-cta-container--portrait-placement`
- CTA container shown in portrait/top flow.

12. `.landing-page-cta-container--sidebar-placement`
- CTA container shown inside the sidebar in square/landscape.

13. `.landing-page-actions`
- Wrapper for cookie UI and/or URL button.

14. `.landing-page-cookie-consent`
- Cookie acceptance block wrapper.

15. `.landing-page-cookie-row`
- Row containing checkbox and cookie text.

16. `.landing-page-cookie-checkbox`
- Cookie acceptance checkbox.

17. `.landing-page-cookie-copy`
- Cookie acceptance descriptive text.

18. `.landing-page-cookie-button`
- Button that confirms cookie acceptance.

19. `.landing-page-url-button`
- Main CTA button that opens the configured URL.

20. `.landing-page-url-button--disabled`
- Disabled URL button state when cookies are required but not yet accepted.

21. `.landing-page-main`
- Main content area below header.
- Contains slideshow column and optional sidebar.

22. `.landing-page-main--with-sidebar`
- State where a second column exists.

23. `.landing-page-main--without-sidebar`
- State where only the slideshow column exists.

24. `.landing-page-media-column`
- Column that contains the slideshow frame.

25. `.landing-page-media-fit`
- Fit-box container that sizes the slideshow region to the true target aspect ratio.

26. `.landing-page-media-frame`
- Visible slideshow frame box.
- Border, shadow, background, clipping, corner radius, and framing should be styled here.

27. `.landing-page-media-iframe`
- Embedded slideshow or slideshow-layout viewport.

28. `.landing-page-sidebar`
- Right-side utility column in square/landscape layouts.

29. `.landing-page-sidebar-qr`
- QR section wrapper.

30. `.landing-page-sidebar-qr-frame`
- Inner QR alignment and scaling frame.

31. `.landing-page-sidebar-qr-image`
- Actual QR image.

32. `.landing-page-sidebar-cta`
- Sidebar action section.

33. `.landing-page-sidebar-logo`
- Sidebar logo section.

34. `.landing-page-sidebar-legal`
- Sidebar legal section wrapper.

35. `.landing-page-legal-title`
- Legal section heading.

36. `.landing-page-legal-links`
- Stack wrapper for legal links.

37. `.landing-page-legal-link`
- Shared legal link styling.

38. `.landing-page-legal-link--terms`
- Terms and Conditions link.

39. `.landing-page-legal-link--privacy`
- Privacy Policy link.

## Content Conditions

1. Title
- Always rendered.
- Uses custom title if available.
- Otherwise uses event name.

2. Description
- Only rendered when present.
- Root state:
  - `.landing-page--has-description`
  - `.landing-page--no-description`

3. Logo
- Only rendered when present.
- Root state:
  - `.landing-page--has-logo`
  - `.landing-page--no-logo`

4. Slideshow / layout
- Always rendered.
- Root target state:
  - `.landing-page--target-layout`
  - `.landing-page--target-slideshow`

5. QR code
- Only rendered when present.
- Root state:
  - `.landing-page--has-qr`
  - `.landing-page--no-qr`

6. CTA area
- Rendered when either URL exists or cookie consent is enabled.
- Root state:
  - `.landing-page--has-cta`
  - `.landing-page--no-cta`

7. Legal area
- Rendered when terms and/or privacy exist.
- Root state:
  - `.landing-page--has-legal`
  - `.landing-page--no-legal`

8. Sidebar
- Rendered when QR or legal content exists.
- Root state:
  - `.landing-page--has-sidebar`
  - `.landing-page--no-sidebar`

## Layout Intent

### Portrait Mode

1. Use a single-column layout.
2. Center the header content horizontally.
3. The logo should appear at the top.
4. The title should visually match the slideshow width.
5. The description sits below the title.
6. The CTA area sits above the slideshow.
7. The slideshow uses maximum available width.
8. QR and legal content flow below the slideshow if present.
9. The page should avoid scrolling whenever possible.

### Square And Landscape Mode

1. Use a two-column layout when sidebar content exists.
2. Left column is the slideshow/media area.
3. Right column is the utility/sidebar area.
4. The slideshow should remain the dominant visual area.
5. The slideshow frame must follow the exact media aspect ratio.
6. The sidebar should visually balance against the slideshow height.
7. The QR code should take the largest remaining utility space.
8. CTA area must remain usable and readable.
9. Logo remains visible but lower priority than slideshow, QR, and CTA.
10. Legal links remain available but lower priority than slideshow, QR, CTA, and logo.

## Sidebar Sizing Intent

1. `.landing-page-sidebar-qr` is the flexible area.
2. `.landing-page-sidebar-cta` should remain visible and usable.
3. `.landing-page-sidebar-logo` should remain visible and can align to the bottom.
4. `.landing-page-sidebar-logo .landing-page-logo` should respect a max-height of `120px` unless intentionally redesigned.
5. Equal spacing between QR, CTA, and logo is allowed when needed for balance.

## Action Area Intent

1. `.landing-page-url-button` is the primary CTA.
2. `.landing-page-cookie-button` is the consent action.
3. `.landing-page-url-button--disabled` represents blocked URL access until cookies are accepted.
4. Button shape, color, font, weight, spacing, border, and shadow should all be driven from CSS.
5. Single-line CTA text in sidebar mode is a valid design goal.

## Media Area Intent

1. `.landing-page-media-fit` is a fitting container.
2. `.landing-page-media-frame` is the actual frame that should be visually styled.
3. `.landing-page-media-iframe` is the embedded content region.
4. The slideshow should look like the hero stage, not like a generic browser embed.
5. No extra unintended background should be visible around the slideshow if layout sizing is correct.

## Legal Area Intent

1. `.landing-page-sidebar-legal` is optional.
2. `.landing-page-legal-title` is the heading.
3. `.landing-page-legal-links` is the stack of legal actions.
4. `.landing-page-legal-link--terms` opens terms.
5. `.landing-page-legal-link--privacy` opens privacy policy.

## CSS Ownership Rule

The landing page CSS should control:
1. background
2. colors
3. typography
4. spacing
5. alignment
6. borders
7. shadows
8. corner radius
9. frame treatment
10. portrait layout behavior
11. square layout behavior
12. landscape layout behavior
13. CTA treatment
14. QR sizing treatment
15. logo placement treatment
16. legal section treatment

The app provides the structural class system for that work.
