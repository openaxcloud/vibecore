-- Newsletter subscribers (2026-07-02). Backs the public POST
-- /newsletter/subscribe endpoint used by the marketing footer mini-form.
-- Email is unique so re-subscribing is an idempotent upsert (a previous
-- unsubscribe is cleared instead of inserting a duplicate).
CREATE TABLE IF NOT EXISTS "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'footer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_email_key"
    ON "NewsletterSubscriber" ("email");
