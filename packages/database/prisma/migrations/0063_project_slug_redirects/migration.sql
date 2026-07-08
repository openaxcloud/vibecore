-- F13: 30-day redirect from a project's old slug to its current one after a slug
-- rename. ADDITIVE ONLY — a single new "ProjectSlugRedirect" table with an FK to
-- Project. No ALTER/DROP/RENAME on any existing table (Project is untouched).
-- Reversible by dropping "ProjectSlugRedirect".

-- CreateTable
CREATE TABLE "ProjectSlugRedirect" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "oldSlug" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSlugRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSlugRedirect_projectId_oldSlug_key" ON "ProjectSlugRedirect"("projectId", "oldSlug");

-- CreateIndex
CREATE INDEX "ProjectSlugRedirect_oldSlug_idx" ON "ProjectSlugRedirect"("oldSlug");

-- AddForeignKey
ALTER TABLE "ProjectSlugRedirect" ADD CONSTRAINT "ProjectSlugRedirect_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
