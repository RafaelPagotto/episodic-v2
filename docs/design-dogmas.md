# Design Dogmas

## Core principle

**Episodic should be clear, unconvoluted, uncomplicated, uncluttered and feel snappy.**

Every design decision should support users in understanding their library, choosing what to watch and tracking progress with minimal effort.

## Purpose and simplicity

- Every element should communicate content, state or an action.
- Remove redundant labels, symbols, controls and explanations.
- Keep interactions predictable and avoid unnecessary steps.
- Preserve information needed to make informed decisions.
- Use recognizable icons with accessible names; retain visible text when an icon alone would be ambiguous.

## Consistency

- Equivalent actions should use the same symbols, terminology, states and behavior throughout the website.
- Reuse shared components and styles.
- Keep spacing, alignment and visual hierarchy consistent.
- Clickable titles should underline on hover and keyboard focus.
- Equivalent faded states should use the same opacity and restore visibility immediately on hover or keyboard focus.

## Motion

**Motion must earn its place through a clear, useful function.**

- Use motion only when it materially helps users understand an ongoing process, a change of state or an action's result.
- Prefer immediate, static feedback when it communicates equally well.
- Decorative animations, transitions and zoom effects are prohibited.
- "Looks cool," "adds personality" and "is fun" are insufficient reasons.
- Loading spinners are an established functional exception, not an exhaustive list of permitted motion.
- Any new exception should document what information the motion conveys and why it improves understanding.

## Depth and appearance

### Shadows

Shadows are permitted because they provide depth without movement.

Use restrained shadows to separate elements from their backgrounds and each other, establish hierarchy and direct attention. Users should perceive the resulting structure without being distracted by the effect itself.

### Glows and gradients

- Decorative glows and interface gradients are prohibited.
- Use flat colors, borders and restrained shadows to communicate structure and state.
- Meaningful color remains appropriate for selection, progress, favourites, errors and destructive actions.
- Supplied third-party branding and poster artwork are evaluated separately from interface decoration.

### Blur

Existing blur treatments are acceptable for now. Evaluate additional uses for readability, clarity and visual clutter.

## Feedback and responsiveness

- Acknowledge actions promptly and make ongoing work apparent.
- Keep feedback concise and consistent.
- Notifications should not shift the page layout.
- Avoid redundant feedback indicators.
- Preserve stable layouts and usable controls across screen sizes.
- Optimize actual loading and navigation speed alongside perceived responsiveness.

## Accessibility and safeguards

- Preserve visible keyboard focus, readable contrast and keyboard access.
- Essential controls must remain available without hover.
- Communicate consequential actions clearly.
- Keep appropriate safeguards for destructive or bulk actions.
- Never compromise tracking correctness or data completeness to simplify the interface or improve speed.

## Review checklist

Before accepting a UI/UX change, check:

- Does it make the task easier to understand or complete?
- Does every added element serve a clear purpose?
- Does it follow existing interaction and visual patterns?
- Is any motion functionally justified?
- Is the layout stable, readable and usable across screen sizes?
- Are accessibility, feedback and data safeguards preserved?

**Record justified exceptions explicitly. Update shared patterns and this document when a design decision changes.**
