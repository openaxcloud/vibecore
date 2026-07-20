> ## Documentation Index
> Fetch the complete documentation index at: https://docs.replit.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Migrating an existing app to Clerk Auth

> Best practices for migrating an existing app with its own authentication to Clerk Auth without losing user accounts or historical data.

If your app already has a working authentication system and a database of real users, swapping in [Clerk Auth](/features/auth-and-identity/clerk-auth) is **not just a code change**, it's a data migration. Without a deliberate plan, every existing row in your `users` table becomes a stranger to Clerk: new accounts get provisioned on first sign-in, none of them line up with your historical data, and returning customers appear to have "lost" their account.

There are really only two things you need to get right.

<Note>
  This page only covers migrating from a **custom authentication solution** (your own users table, password hashing, sessions, etc.) to Clerk Auth. It is **not** a guide for moving an app from [Replit Auth](/features/auth-and-identity/authentication) to Clerk Auth — official guidance for that migration path is coming soon.

  If you're starting a new app, see the [Clerk Auth overview](/features/auth-and-identity/clerk-auth) — no migration is needed.
</Note>

## 1. Import your existing users into Clerk

Every active user in your app needs to exist as a Clerk user *before* Clerk Auth goes live. At minimum, each import needs to include:

* **Email** (required)
* **Available profile metadata**: name, verified status, anything else you want visible in the Auth pane
* **Password digest**: the user's existing password hash
* **Password hasher**: the algorithm/format of that hash, exactly as Clerk expects it

The hasher is the part that's easy to get wrong. Clerk only accepts a defined set of password hash formats, and each has a specific string identifier (`bcrypt`, `scrypt_firebase`, `argon2i`, `pbkdf2_sha256`, etc.). See the full list and the exact digest format each one requires in the [Clerk Create User API reference](https://clerk.com/docs/reference/backend/user/create-user).

This step requires more than a one-line prompt. The Agent driving the migration needs a **thorough understanding of how passwords are hashed in your current codebase** — which library, which parameters (cost factor, salt layout, pepper, etc.), and how that maps onto one of Clerk's supported hashers. A well-formed prompt looks something like:

```
Read my existing auth code and identify exactly how passwords are hashed
(library, algorithm, parameters, and how the stored value is formatted).
Then write a one-shot import script that, for every user in my users table,
calls the Clerk Backend API with email, profile metadata, the password
digest in the exact format the matching Clerk hasher expects, and the
correct `passwordHasher` value. Tell me which Clerk hasher you picked
and why before you run it.
```

If your hashing scheme doesn't map cleanly to any of Clerk's supported hashers, imported users won't be able to sign in with their existing password. In that case, import them without a digest and send a password-reset email at cutover.

## 2. Resolve Clerk users back to your existing user IDs

Once imported users sign in, every authenticated request carries a Clerk identity. Your server needs to map that identity back to the row in your `users` table — otherwise the Clerk user ID won't match any of your existing foreign keys (`orders.user_id`, `documents.owner_id`, etc.) and historical data will appear lost.

Replit-managed Clerk makes this straightforward: when you import a user with their existing ID as the Clerk user's `externalId`, that value is automatically written into the session claims as `sessionClaims.userId`. Your middleware just needs to prefer it over the raw Clerk user ID:

```ts theme={null}
import { getAuth } from "@clerk/express";

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
};
```

With this pattern:

* **Imported users** resolve to your existing `users.id` via `sessionClaims.userId` — all their historical data stays attached.
* **Brand-new users** (who signed up after the cutover and have no `externalId`) fall back to `auth.userId`, which is their Clerk user ID. Use the Clerk user ID as the primary key for these new rows, or create a row at first sign-in and link it back.

## That's it

Everything else — keeping your old auth running in parallel, running a dry-run against real accounts, monitoring for duplicate-user creation after cutover, decommissioning the old system — is standard migration hygiene and not specific to Clerk Auth.

## Additional resources

* [Clerk Auth overview](/features/auth-and-identity/clerk-auth) — How Clerk Auth works on Replit
* [Clerk: Create User API](https://clerk.com/docs/reference/backend/user/create-user) — Supported password hashers and digest formats
