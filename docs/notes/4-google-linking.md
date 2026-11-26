# Google linking to an unverified password account (ticket #4)

Checked against Better Auth 1.7.28 (`handleOAuthUserInfo` in `better-auth/dist/oauth2/link-account.mjs`).

**Default behaviour:** Better Auth does not remove the password. It refuses the link instead.
`account.accountLinking.requireLocalEmailVerified` defaults to `true`. When Google signs in with an email that
belongs to an unverified local user, the callback redirects to the error URL with `error=account_not_linked`.
No session is created and the user stays unverified with the old password. The real owner of the email then
can't sign in with Google, which breaks the "one account per email" story.

Better Auth has no built-in "drop the password on link" step. When it does link (to a verified user), it only
adds the Google account and sets `emailVerified: true`.

**What we do:** set `requireLocalEmailVerified: false` so the link happens, and add a
`databaseHooks.account.create.after` hook. When a non-credential account is created for a user who is still
unverified, the hook deletes that user's `credential` account (the password). The hook runs before Better Auth
marks the user verified. The pre-registered password stops working, and the user can set a new one with the
password reset.

Covered by `apps/api/test/google.spec.ts`.
