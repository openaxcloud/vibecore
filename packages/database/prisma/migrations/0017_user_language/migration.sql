-- Phase 0 #7 react-i18next slice 2: persist the user's preferred language
-- so SSR can render the correct copy on first paint (cookie propagation
-- + server-aware i18next). Nullable: existing users have never been
-- asked, the client keeps detecting via navigator.language until they
-- explicitly pick one in the account settings.

ALTER TABLE "User" ADD COLUMN "language" TEXT;
