# Dependency Audit Notes

Last reviewed: 2026-06-05

## Next.js bundled PostCSS advisory

`npm audit --omit=dev` currently reports two moderate production findings:

- `postcss` via `next/node_modules/postcss`
- `next` because it bundles that PostCSS version

The underlying advisory is `GHSA-qx2v-qp2m-jg93`, affecting `postcss <8.5.10`.

The app has been updated to the latest available Next.js 15 backport, `next@15.5.19`. That release still declares `postcss@8.4.31`, so the production audit finding remains.

The audit-proposed fix is not accepted because it points to `next@9.3.3`, which would be a major downgrade and incompatible with the v2 Next.js App Router architecture.

No override is applied for Next's nested PostCSS dependency. Overriding a framework-bundled dependency could create untested behavior inside Next.js build/runtime internals. Revisit this when a Next.js 15 backport or an approved framework upgrade includes `postcss >=8.5.10`.

## Current acceptance

This is a temporary risk acceptance for the v2 project while staying on Next.js 15.

Rationale:

- The finding is moderate severity.
- The vulnerable package is nested inside Next.js rather than used directly by application code.
- A safe same-major Next.js fix is not currently available.
- Force upgrades, downgrades, and dependency overrides are intentionally avoided.

Recommended follow-up:

Run `npm audit --omit=dev` regularly and upgrade Next.js within the current major when a patched backport is released. Reassess a Next.js major upgrade separately.
