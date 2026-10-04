-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "stash" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "CampaignTemplate" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folder" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "body" JSONB NOT NULL,
    "stages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grant" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "templateId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "stages" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lock" TEXT NOT NULL DEFAULT 'none',
    "visibility" TEXT NOT NULL DEFAULT 'visible',
    "expires" TEXT NOT NULL DEFAULT 'never',
    "left" INTEGER NOT NULL DEFAULT 0,
    "removal" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignTemplate_campaignId_idx" ON "CampaignTemplate"("campaignId");

-- CreateIndex
CREATE INDEX "Grant_campaignId_status_idx" ON "Grant"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Grant_characterId_status_idx" ON "Grant"("characterId", "status");

-- CreateIndex
CREATE INDEX "Grant_templateId_idx" ON "Grant"("templateId");

-- AddForeignKey
ALTER TABLE "CampaignTemplate" ADD CONSTRAINT "CampaignTemplate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CampaignTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
