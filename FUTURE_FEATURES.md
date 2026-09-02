# Future features

Ideas queued but deliberately not built yet, so they don't get lost. Confirm scope again before starting any of these — this is a list, not a spec.

## AI assistant ("PG Buddy")

A 24/7 in-app AI chat assistant, inspired by a competitor's landing page.

- Needs scoping first: what should it actually help with — answering tenant questions, summarizing dues, something else?
- Needs an AI provider decision before any code — use the `marketplace` skill to pick one (likely Vercel AI Gateway) rather than hardcoding a provider SDK.

## QR-code tenant self-onboarding

Owner shares a QR code or link; the tenant fills in their own onboarding details (name, phone, ID docs, etc.) on their own phone, landing in the app either auto-created or queued for the owner to review and assign a room.

- Should come after the full-app re-theme, so it's built with the new visual style rather than needing a re-style later.

## Not currently planned

From the same competitor screenshot, explicitly out of scope unless revisited: a supplier/service-provider marketplace, and a separate public marketing landing page.
