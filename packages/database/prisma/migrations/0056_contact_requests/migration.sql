-- Contact-sales requests (2026-07-03). Backs the public POST /contact-sales
-- endpoint behind the marketing contact form. The row id doubles as the
-- reference number quoted back to the prospect (first 8 chars, uppercased),
-- so sales can locate the lead from the reference alone.
CREATE TABLE IF NOT EXISTS "ContactRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT NOT NULL,
    "teamSize" TEXT,
    "message" TEXT NOT NULL,
    "pagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);
