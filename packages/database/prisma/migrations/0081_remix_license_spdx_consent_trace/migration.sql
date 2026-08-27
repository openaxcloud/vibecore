-- P0-V3-05 — réserve #8 : TRACE AUDITABLE des confirmations de curation.
-- Avant cette migration, rightsConfirmed / piiPolicyAccepted étaient validés
-- par la route puis jamais persistés : on ne pouvait pas prouver a posteriori
-- que le curateur avait confirmé détenir les droits.
ALTER TABLE "GalleryListing" ADD COLUMN "rightsConfirmedAt"   TIMESTAMP(3);
ALTER TABLE "GalleryListing" ADD COLUMN "rightsConfirmedBy"   TEXT;
ALTER TABLE "GalleryListing" ADD COLUMN "piiPolicyAcceptedAt" TIMESTAMP(3);
ALTER TABLE "GalleryListing" ADD COLUMN "piiPolicyAcceptedBy" TEXT;

-- FAIL-CLOSED rétroactif (réserve #7) : un listing remixable dont la licence
-- n'est PAS dans l'allowlist SPDX des licences autorisant la dérivation
-- redevient non-remixable. On ne devine jamais l'intention d'une licence :
-- tout ce qui n'est pas explicitement dérivable est fermé.
-- (La liste ci-dessous doit rester alignée sur DERIVATIVE_ALLOWED_SPDX dans
--  services/api/src/license-policy.ts ; l'enforcement runtime reste la source
--  de vérité, cette clause ne fait que nettoyer l'existant.)
UPDATE "GalleryListing"
SET "remixAllowed" = false
WHERE "remixAllowed" = true
  AND ("licenseId" IS NULL
       OR "licenseId" NOT IN (
         '0BSD','Apache-2.0','Artistic-2.0','BSD-2-Clause','BSD-3-Clause',
         'BSD-3-Clause-Clear','BSL-1.0','CC0-1.0','ISC','MIT','MIT-0','MS-PL',
         'PostgreSQL','Unlicense','Zlib',
         'AGPL-3.0-only','AGPL-3.0-or-later','CDDL-1.0','EPL-2.0','EUPL-1.2',
         'GPL-2.0-only','GPL-2.0-or-later','GPL-3.0-only','GPL-3.0-or-later',
         'LGPL-2.1-only','LGPL-2.1-or-later','LGPL-3.0-only','LGPL-3.0-or-later',
         'MPL-2.0',
         'CC-BY-3.0','CC-BY-4.0','CC-BY-SA-3.0','CC-BY-SA-4.0'
       ));
