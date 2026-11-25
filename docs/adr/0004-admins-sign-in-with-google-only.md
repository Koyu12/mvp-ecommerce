# Admins sign in with Google only

Users with the `admin` role cannot sign in with email and password; only Google sign-in is accepted for them. Better Auth's `twoFactor` plugin does not gate social sign-in and has no per-role enforcement, so requiring TOTP for Admins would also need a hook blocking Google for them, plus an enrolment flow. While the Store has one Admin, relying on that Admin's Google account (with Google 2FA turned on) gives strong protection for about ten lines of code.

## Consequences

Admin security depends on each Admin's Google account, which we cannot enforce. When the Store adds Admins whose Google security we don't control, switch to password + required TOTP with Google blocked for Admins.
