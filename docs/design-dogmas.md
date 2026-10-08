# Design Dogmas

## A philosophy for Episodic

**Episodic should be clear, unconvoluted, uncomplicated, uncluttered and feel snappy.**

This is the starting point for design judgment. It should help us reason about unfamiliar situations and explain why a decision serves the person using the website. The examples in this document express that philosophy in the current interface; they cannot anticipate every future design problem.

Episodic exists to help people understand their library, choose what to watch and keep reliable track of their progress. Design succeeds when those activities feel straightforward and the interface asks for little effort or interpretation.

## Respect attention

Attention is limited. Every label, symbol, visual effect and interruption asks for some of it. What we place on the screen should repay that attention by conveying useful content, explaining a state or making an action understandable.

Simplicity requires judgment. Removing an explanation that prevents accidental data loss would make the screen smaller while making the experience worse. Removing two symbols that communicate the same watched state can make the interface easier to understand. We seek the least visual and behavioral complexity that still communicates what people need.

An element's usefulness depends on its context. A vignette on a clickable poster can communicate that navigation is available. Applying it to a poster that leads nowhere makes that same visual treatment misleading. A familiar effect should carry a dependable meaning wherever it appears.

## Make interaction honest

The interface should make clear what can be done, what is happening and what has happened. Visual cues should correspond to real capabilities. Labels, hit areas and feedback should agree with the action they represent.

Predictability reduces the need to relearn the website. Equivalent actions should share language, symbols and behavior. Shared components help preserve that agreement, but consistency also requires understanding the purpose of an interaction. A whole checkbox option card can reasonably activate its option; unrelated blank space beside a field label should not focus that field.

Current applications include underlining clickable titles, using a subtle vignette only on posters that navigate, and changing a form field's existing border color to show focus. These communicate interaction without adding redundant outlines or halos. Faded cards share one treatment and restore visibility immediately on hover or keyboard focus so their contents and controls remain usable. These are established patterns to reuse and evaluate through their purpose, rather than visual recipes to apply indiscriminately.

## Give appearance a purpose

Visual hierarchy helps people distinguish content, locate controls and understand relationships. Spacing, alignment, typography, flat colors and restrained borders should make that structure legible without competing with the content.

Shadows are useful because they suggest depth without movement. They can separate elements from the background and each other, or direct attention to something important, while the mechanism creating that separation stays unobtrusive. Their value comes from the clarity they provide.

Decorative glows and interface gradients add attention without useful information and do not belong in Episodic. A functional treatment needs a specific explanation of what it communicates. The subtle radial vignette on a clickable poster is such an application: it signals navigation, stays confined to the artwork and leaves badges and controls above it. This justification does not extend to other gradients merely because they look appealing.

Color can communicate selection, progress, favourites, errors and consequential actions. Poster artwork and supplied third-party branding have their own visual character. Existing blur treatments are acceptable for now; further use should be judged by readability, clarity and the attention it consumes.

## Let feedback explain the process

Motion must earn its place through a clear, useful function. It should materially help someone understand an ongoing process, a change of state or an action's result. If static feedback explains the same thing equally well, use it. Decorative animations, transitions and zoom effects add unnecessary work for the eye.

A loading spinner communicates that work is still underway. That makes it a useful example of this principle, rather than the only possible motion exception. Any other use needs its own explanation of the information it conveys and why motion helps convey it. Novelty, personality and amusement are insufficient reasons.

Feedback should acknowledge actions promptly, remain concise and preserve the user's place. A notification should not move the content being used. Showing that something is loading can make a delay understandable, but we should also reduce the delay itself. Snappiness comes from responsive behavior, stable layouts and efficient work.

## Design for varying circumstances

People encounter Episodic through different screen sizes, input methods, abilities, devices and connections. A usable design accommodates those circumstances. Its layout may change while its meaning and essential capabilities remain dependable.

Keyboard focus, readable contrast and access without hover are part of clear communication. Controls should have understandable accessible names. Icons can reduce clutter when their meaning is recognizable; visible words remain useful when an icon would leave people guessing.

Library cards keep their four actions together in one row. Below 640px, those controls use 36px height, 16px icons and equal flexible widths capped at 44px. This makes the relationship between actions clearer and reduces card height while preserving every action, accessible name and safeguard. The smaller touch targets are a deliberate density trade-off to review on narrow phones. At larger widths, the existing 44px controls remain; this sizing is local to Library card actions.

Start with understandable content and dependable core interactions, then add enhancements that improve them. Where practical, an enhancement's absence or failure should leave the underlying task usable. This approach is informed by Jeremy Keith's [Resilient Web Design](https://resilientwebdesign.com/), particularly its discussion of [layers and progressive enhancement](https://resilientwebdesign.com/chapter5/).

For Episodic, tracking correctness and data completeness are foundational. A faster or simpler interface cannot justify incorrect progress. Consequential actions need clear explanations and safeguards appropriate to their scope; a single episode toggle and deleting a library have different consequences.

Progress percentages use whole numbers, but rounding must not imply completion: incomplete episode progress is capped at 99%, and 100% is reserved for all eligible episodes being watched. Episode counts remain the source of truth for completion and tracking status.

## Apply judgment and preserve the reasoning

Begin a change by identifying the user's task and the difficulty being addressed. Explain how the proposed design helps, what information it communicates and what attention or complexity it adds. Judge it in the contexts where it will actually be used.

Existing decisions remain the shared starting point. When a better application of the philosophy emerges, explain the reason, update the shared pattern and record the decision here. New situations require reasoning from the principles; an effect is not justified simply because it is absent from a prohibited list, and an existing pattern is not justified in a context where it no longer serves its purpose.

## Review checklist

Guest sessions use an unframed, restrained identity/expiration band with an Exit
demo command and a collapsed Reset demo confirmation. Expiration and reset copy
explain data loss; the typed confirmation protects the visitor's demo changes.
Try demo is secondary to sign-in. Demo search shows the available cached titles
immediately rather than asking visitors to guess which titles are available.
CAPTCHA appears only when configured and uses the provider's familiar widget;
its third-party appearance is a security requirement, not decorative UI.

Use these questions to examine the reasoning and the result:

- What task does this help someone understand or complete?
- What does each element or effect communicate, and is that meaning truthful?
- Does the benefit justify the attention and complexity it introduces?
- Will familiar actions remain predictable across the website?
- Would simpler or static feedback communicate equally well?
- Does the experience remain clear and usable across screen sizes and input methods?
- Are accessibility, feedback, tracking correctness and data safeguards preserved?

The answers should explain the design decision. Checking boxes alone does not establish that a design is good.
