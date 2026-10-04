-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "presentMapId" TEXT;

-- CreateTable
CREATE TABLE "CampaignMap" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'place',
    "imageId" TEXT,
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "grid" JSONB NOT NULL DEFAULT '{}',
    "fog" JSONB NOT NULL DEFAULT '{}',
    "pins" JSONB NOT NULL DEFAULT '[]',
    "tokens" JSONB NOT NULL DEFAULT '[]',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignMap_campaignId_idx" ON "CampaignMap"("campaignId");

-- AddForeignKey
ALTER TABLE "CampaignMap" ADD CONSTRAINT "CampaignMap_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMap" ADD CONSTRAINT "CampaignMap_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CampaignMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
