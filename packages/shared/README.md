# Shared studio modules

Web and PWA import `@imajilearn/shared`. This package contains browser-safe
models, validation, API clients and the original character/icon components.
It does not import Prisma, server configuration, credentials or API handlers.

- `lib/materials.mjs`: materials, folders and media preferences.
- `lib/studio-api.mjs`: same-origin API transport, versions and idempotency.
- `lib/account-client.mjs`: account requests and profile cache.
- `lib/session.mjs`: session-change signal and login route for web or `/app`.
- `lib/lkpd*.mjs`, `lib/exams.mjs`: existing document models and rules.
- `components/mascot.jsx`, `components/icon.jsx`: original source artwork.
- `assets`: canonical public brand URLs. SVG files remain in `apps/web/public`;
  both frontends access them on the same public origin, without copied files.

Existing `apps/web/lib` and character/icon imports re-export this package to
preserve compatibility. New PWA features import the package directly. Storage
keys and document schemas are unchanged; this does not migrate local LKPDs
to the database. Local storage remains scoped to the teacher and origin.

Session expiry sends web to `/masuk` and mobile to `/app/masuk`. Callers must
preserve account-change checks and must not cache private API responses.
Mobile auth screens use the same API and session cookies.

## Document studios

`components/lkpd-studio.jsx` and `components/exam-studio.jsx` own the existing
document workflows. Both require a client `Frame` component wrapping their
content: web supplies its header/navigation frame and PWA supplies a section
inside its mobile shell. `teacherId` must come from the verified session.
LKPD accepts `materialsHref` for the source-library link. PWA passes the
navigation-block setter through `onNavigationBlock`; exams also accept
`compact` to separate the saved library from the creation form on mobile.

The viewer, page renderer, template shapes, selectors, dialogs and their
stylesheets also live here. Web imports remain compatibility re-exports.
Document dimensions and print rules are unchanged. LKPD storage is still
local per teacher/origin; this refactor does not connect the B2 storage API.
