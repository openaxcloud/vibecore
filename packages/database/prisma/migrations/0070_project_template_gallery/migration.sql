-- There are no production users yet. Replace the obsolete organization-only
-- starter-template bookmark with the current community Gallery, Remix and
-- two-phase Import Hub domains instead of carrying legacy rows forward.
DROP TABLE "ProjectTemplate";

CREATE TYPE "GalleryAppStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "GalleryModerationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "GalleryPreviewStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');
CREATE TYPE "GalleryVisibility" AS ENUM ('PUBLIC', 'UNLISTED');
CREATE TYPE "GalleryArtifactType" AS ENUM ('BUSINESS_APP', 'BOOKING', 'CRM', 'DASHBOARD', 'ECOMMERCE', 'GAME', 'INTERNAL_TOOL', 'LANDING_PAGE', 'PRODUCTIVITY', 'SOCIAL', 'OTHER');
CREATE TYPE "GalleryReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');
CREATE TYPE "GalleryReportReason" AS ENUM ('COPYRIGHT', 'DECEPTIVE', 'HARMFUL', 'INAPPROPRIATE', 'MALWARE', 'PRIVACY', 'SPAM', 'OTHER');
CREATE TYPE "GalleryRemixStatus" AS ENUM ('CREATING', 'READY', 'FAILED');
CREATE TYPE "ProjectImportSource" AS ENUM ('GITHUB', 'BITBUCKET', 'VERCEL', 'FIGMA', 'CLAUDE', 'BOLT', 'LOVABLE', 'BASE44', 'ZIP', 'SPREADSHEET', 'PREVIOUS_AGENT', 'EMPTY');
CREATE TYPE "ProjectImportStatus" AS ENUM ('VALIDATING', 'READY', 'CREATING', 'COMPLETE', 'FAILED', 'CANCELED');

CREATE TABLE "GalleryApp" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sourceProjectId" TEXT,
    "organizationId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorHandle" TEXT NOT NULL,
    "authorDisplayName" TEXT NOT NULL,
    "authorAvatarUrl" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "artifactType" "GalleryArtifactType" NOT NULL,
    "category" TEXT NOT NULL,
    "technologies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "thumbnailUrl" TEXT NOT NULL,
    "visibility" "GalleryVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "GalleryAppStatus" NOT NULL DEFAULT 'DRAFT',
    "moderationStatus" "GalleryModerationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "moderationReason" TEXT,
    "remixAllowed" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "remixCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "previewStatus" "GalleryPreviewStatus" NOT NULL DEFAULT 'PENDING',
    "previewUrl" TEXT,
    "previewEvidence" JSONB,
    "latestVersionId" TEXT,
    "sourceGalleryAppId" TEXT,
    "sourceGalleryAppSlug" TEXT,
    "submittedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GalleryApp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GalleryAppVersion" (
    "id" TEXT NOT NULL,
    "galleryAppId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "files" JSONB NOT NULL,
    "runtime" JSONB NOT NULL,
    "dataRequirements" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "byteLength" BIGINT NOT NULL,
    "removedPaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "redactedValueCount" INTEGER NOT NULL DEFAULT 0,
    "validationChecks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GalleryAppVersion_pkey" PRIMARY KEY ("id")
);

-- galleryAppId intentionally has no FK: code-owned `demo:*` apps can be
-- reported and remixed without fabricating mutable database publication rows.
CREATE TABLE "GalleryReport" (
    "id" TEXT NOT NULL,
    "galleryAppId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reason" "GalleryReportReason" NOT NULL,
    "details" TEXT,
    "status" "GalleryReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GalleryReport_pkey" PRIMARY KEY ("id")
);

-- Gallery IDs/versions also intentionally have no FKs here for immutable
-- code-owned demos. Destination resources remain tenant-bound by real FKs.
CREATE TABLE "ProjectRemix" (
    "id" TEXT NOT NULL,
    "galleryAppId" TEXT NOT NULL,
    "galleryAppVersionId" TEXT NOT NULL,
    "sourceProjectId" TEXT,
    "destinationOrganizationId" TEXT NOT NULL,
    "destinationOwnerUserId" TEXT NOT NULL,
    "destinationProjectId" TEXT,
    "destinationRepositoryId" TEXT,
    "destinationWorkspaceId" TEXT,
    "agentAnalysisId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "GalleryRemixStatus" NOT NULL DEFAULT 'CREATING',
    "errorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectRemix_pkey" PRIMARY KEY ("id")
);

-- Source payloads are never persisted. The job stores only a hash plus safe
-- validation/detection metadata; create resubmits and verifies the source.
CREATE TABLE "ProjectImportJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "ProjectImportSource" NOT NULL,
    "status" "ProjectImportStatus" NOT NULL DEFAULT 'VALIDATING',
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "sourceReference" TEXT,
    "sourceLabel" TEXT,
    "stage" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "validation" JSONB NOT NULL DEFAULT '{}',
    "runtimeDetection" JSONB NOT NULL DEFAULT '{}',
    "missingSecretNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "generatedConfig" JSONB NOT NULL DEFAULT '[]',
    "preview" JSONB NOT NULL DEFAULT '{}',
    "usesAgent" BOOLEAN NOT NULL DEFAULT false,
    "creditsDisclosure" TEXT,
    "destinationProjectId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "recoverable" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectImportJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GalleryApp_slug_key" ON "GalleryApp"("slug");
CREATE INDEX "GalleryApp_organizationId_status_updatedAt_idx" ON "GalleryApp"("organizationId", "status", "updatedAt");
CREATE INDEX "GalleryApp_status_moderationStatus_previewStatus_publishedAt_idx" ON "GalleryApp"("status", "moderationStatus", "previewStatus", "publishedAt");
CREATE INDEX "GalleryApp_featured_remixCount_publishedAt_idx" ON "GalleryApp"("featured", "remixCount", "publishedAt");
CREATE INDEX "GalleryApp_sourceProjectId_idx" ON "GalleryApp"("sourceProjectId");
CREATE INDEX "GalleryApp_authorUserId_idx" ON "GalleryApp"("authorUserId");
CREATE UNIQUE INDEX "GalleryAppVersion_galleryAppId_version_key" ON "GalleryAppVersion"("galleryAppId", "version");
CREATE UNIQUE INDEX "GalleryAppVersion_galleryAppId_contentHash_key" ON "GalleryAppVersion"("galleryAppId", "contentHash");
CREATE INDEX "GalleryAppVersion_createdByUserId_idx" ON "GalleryAppVersion"("createdByUserId");
CREATE UNIQUE INDEX "GalleryReport_galleryAppId_reporterUserId_reason_key" ON "GalleryReport"("galleryAppId", "reporterUserId", "reason");
CREATE INDEX "GalleryReport_status_createdAt_idx" ON "GalleryReport"("status", "createdAt");
CREATE INDEX "GalleryReport_reporterUserId_createdAt_idx" ON "GalleryReport"("reporterUserId", "createdAt");
CREATE UNIQUE INDEX "ProjectRemix_destinationOrganizationId_idempotencyKey_key" ON "ProjectRemix"("destinationOrganizationId", "idempotencyKey");
CREATE INDEX "ProjectRemix_galleryAppId_createdAt_idx" ON "ProjectRemix"("galleryAppId", "createdAt");
CREATE INDEX "ProjectRemix_galleryAppVersionId_idx" ON "ProjectRemix"("galleryAppVersionId");
CREATE INDEX "ProjectRemix_destinationOwnerUserId_createdAt_idx" ON "ProjectRemix"("destinationOwnerUserId", "createdAt");
CREATE INDEX "ProjectRemix_destinationProjectId_idx" ON "ProjectRemix"("destinationProjectId");
CREATE INDEX "ProjectRemix_status_updatedAt_idx" ON "ProjectRemix"("status", "updatedAt");
CREATE UNIQUE INDEX "ProjectImportJob_organizationId_idempotencyKey_key" ON "ProjectImportJob"("organizationId", "idempotencyKey");
CREATE INDEX "ProjectImportJob_organizationId_createdAt_idx" ON "ProjectImportJob"("organizationId", "createdAt");
CREATE INDEX "ProjectImportJob_userId_createdAt_idx" ON "ProjectImportJob"("userId", "createdAt");
CREATE INDEX "ProjectImportJob_destinationProjectId_idx" ON "ProjectImportJob"("destinationProjectId");
CREATE INDEX "ProjectImportJob_status_updatedAt_idx" ON "ProjectImportJob"("status", "updatedAt");

ALTER TABLE "GalleryApp" ADD CONSTRAINT "GalleryApp_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GalleryApp" ADD CONSTRAINT "GalleryApp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GalleryApp" ADD CONSTRAINT "GalleryApp_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GalleryAppVersion" ADD CONSTRAINT "GalleryAppVersion_galleryAppId_fkey" FOREIGN KEY ("galleryAppId") REFERENCES "GalleryApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GalleryAppVersion" ADD CONSTRAINT "GalleryAppVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GalleryReport" ADD CONSTRAINT "GalleryReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GalleryReport" ADD CONSTRAINT "GalleryReport_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRemix" ADD CONSTRAINT "ProjectRemix_destinationOrganizationId_fkey" FOREIGN KEY ("destinationOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectRemix" ADD CONSTRAINT "ProjectRemix_destinationOwnerUserId_fkey" FOREIGN KEY ("destinationOwnerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectRemix" ADD CONSTRAINT "ProjectRemix_destinationProjectId_fkey" FOREIGN KEY ("destinationProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectImportJob" ADD CONSTRAINT "ProjectImportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectImportJob" ADD CONSTRAINT "ProjectImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectImportJob" ADD CONSTRAINT "ProjectImportJob_destinationProjectId_fkey" FOREIGN KEY ("destinationProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
