-- 0084_auditlog_append_only — AUDX-011
--
-- Le schema AFFIRMAIT l'immuabilite du journal d'audit en commentaire
-- (« DERIVED from immutable AuditLog rows … without mutating the append-only
-- audit trail ») alors qu'AuditLog etait une table Prisma ordinaire : aucun
-- trigger, aucune RULE, aucun REVOKE. N'importe quel porteur de la connexion
-- applicative pouvait reecrire `action`, reattribuer `actorUserId`, ou vider la
-- table — exactement ce qu'un journal d'audit doit rendre impossible.
--
-- Cette migration APPLIQUE ce que le commentaire promettait, sans casser les
-- deux ecritures LEGITIMES qui existent deja sur main :
--
--   1. la redaction RGPD (services/api/src/prisma-store.ts) qui met `ipAddress`
--      a NULL et marque `metadata` ;
--   2. la purge de retention (services/worker/src/index.ts) qui supprime les
--      lignes plus vieilles que la retention de l'organisation.
--
-- Un troisieme chemin, non evident, a ete MESURE sur PostgreSQL 16 avant
-- d'ecrire ce trigger : les cles etrangeres `ON DELETE SET NULL` de
-- organizationId / actorUserId declenchent bien un BEFORE UPDATE FOR EACH ROW.
-- Un trigger qui refuserait tout UPDATE ferait donc echouer la suppression
-- d'une organisation et l'effacement RGPD d'un compte. Le detachement vers NULL
-- est autorise ; la REATTRIBUTION vers une autre valeur ne l'est pas, car c'est
-- elle qui permettrait de maquiller l'auteur d'une action.

CREATE OR REPLACE FUNCTION auditlog_enforce_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    /*
     * La purge de retention doit DECLARER son intention. Sans ce reglage de
     * session, une suppression est refusee : c'est ce qui distingue une purge
     * de retention d'un effacement de traces.
     */
    IF coalesce(current_setting('vibecore.audit_retention', true), '') = 'on' THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'AuditLog is append-only: DELETE refused. The retention job must declare its intent with SET LOCAL vibecore.audit_retention = ''on''.'
      USING ERRCODE = 'raise_exception';
  END IF;

  -- Ces colonnes portent le CONTENU du fait journalise : jamais modifiables.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.action IS DISTINCT FROM OLD.action
     OR NEW."resourceType" IS DISTINCT FROM OLD."resourceType"
     OR NEW."resourceId" IS DISTINCT FROM OLD."resourceId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'AuditLog is append-only: UPDATE of id/action/resourceType/resourceId/createdAt refused.'
      USING ERRCODE = 'raise_exception';
  END IF;

  /*
   * organizationId et actorUserId ne peuvent que se DETACHER (-> NULL), ce que
   * font les FK ON DELETE SET NULL. Les reattribuer a une autre entite
   * reecrirait l'auteur d'une action : refuse.
   */
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId" AND NEW."organizationId" IS NOT NULL THEN
    RAISE EXCEPTION 'AuditLog is append-only: reattributing organizationId refused (detach to NULL is allowed).'
      USING ERRCODE = 'raise_exception';
  END IF;

  IF NEW."actorUserId" IS DISTINCT FROM OLD."actorUserId" AND NEW."actorUserId" IS NOT NULL THEN
    RAISE EXCEPTION 'AuditLog is append-only: reattributing actorUserId refused (detach to NULL is allowed).'
      USING ERRCODE = 'raise_exception';
  END IF;

  /*
   * `ipAddress` est une donnee personnelle : la redaction RGPD doit pouvoir
   * l'effacer. Elle ne peut que disparaitre, jamais etre reecrite avec une
   * autre adresse — sinon la redaction devient un moyen de falsifier l'origine.
   */
  IF NEW."ipAddress" IS DISTINCT FROM OLD."ipAddress" AND NEW."ipAddress" IS NOT NULL THEN
    RAISE EXCEPTION 'AuditLog is append-only: ipAddress may only be redacted to NULL, never rewritten.'
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditlog_append_only ON "AuditLog";
CREATE TRIGGER auditlog_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION auditlog_enforce_append_only();

-- TRUNCATE contourne les triggers FOR EACH ROW : il lui faut le sien. OLD/NEW
-- n'existent pas dans un trigger TRUNCATE, d'ou une fonction distincte.
CREATE OR REPLACE FUNCTION auditlog_block_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: TRUNCATE refused.'
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditlog_no_truncate ON "AuditLog";
CREATE TRIGGER auditlog_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION auditlog_block_truncate();
