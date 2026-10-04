-- CreateTable
CREATE TABLE "Creature" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "campaignId" TEXT,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT '',
    "alignment" TEXT NOT NULL DEFAULT '',
    "cr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ac" INTEGER NOT NULL DEFAULT 10,
    "hp" INTEGER NOT NULL DEFAULT 1,
    "hpFormula" TEXT NOT NULL DEFAULT '',
    "speed" TEXT NOT NULL DEFAULT '',
    "abilities" JSONB,
    "statblock" JSONB NOT NULL,
    "sourceBook" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LootTable" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folder" TEXT NOT NULL DEFAULT '',
    "rolls" TEXT NOT NULL DEFAULT '1',
    "rows" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LootTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LootDraft" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LootDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutationDraft" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "rolls" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MutationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Creature_campaignId_idx" ON "Creature"("campaignId");

-- CreateIndex
CREATE INDEX "Creature_cr_idx" ON "Creature"("cr");

-- CreateIndex
CREATE UNIQUE INDEX "Creature_source_externalId_key" ON "Creature"("source", "externalId");

-- CreateIndex
CREATE INDEX "LootTable_campaignId_idx" ON "LootTable"("campaignId");

-- CreateIndex
CREATE INDEX "LootDraft_campaignId_status_idx" ON "LootDraft"("campaignId", "status");

-- CreateIndex
CREATE INDEX "MutationDraft_campaignId_status_idx" ON "MutationDraft"("campaignId", "status");

-- AddForeignKey
ALTER TABLE "Creature" ADD CONSTRAINT "Creature_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootTable" ADD CONSTRAINT "LootTable_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootDraft" ADD CONSTRAINT "LootDraft_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutationDraft" ADD CONSTRAINT "MutationDraft_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
