-- CreateTable
CREATE TABLE "public"."AudioItem" (
    "id" TEXT NOT NULL,
    "audio" TEXT,
    "channel" TEXT,
    "date" TIMESTAMP(3),
    "start" TEXT,
    "end" TEXT,
    "program" TEXT,
    "region" TEXT,
    "type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioItem_pkey" PRIMARY KEY ("id")
);
