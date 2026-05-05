ALTER TABLE "AgentMemory"
  ADD COLUMN IF NOT EXISTS "memoryType" TEXT NOT NULL DEFAULT 'semantic',
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "references" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "accessCount" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgentMemory_memoryType_check'
  ) THEN
    ALTER TABLE "AgentMemory"
      ADD CONSTRAINT "AgentMemory_memoryType_check"
      CHECK ("memoryType" IN ('episodic', 'semantic', 'procedural', 'working', 'cache'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgentMemory_accessCount_check'
  ) THEN
    ALTER TABLE "AgentMemory"
      ADD CONSTRAINT "AgentMemory_accessCount_check"
      CHECK ("accessCount" >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AgentMemory_memoryType_updatedAt_idx"
  ON "AgentMemory" ("memoryType", "updatedAt");

CREATE INDEX IF NOT EXISTS "AgentMemory_tags_idx"
  ON "AgentMemory" USING GIN ("tags");
