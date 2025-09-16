-- CreateTable
CREATE TABLE "public"."AudioData" (
    "id" SERIAL NOT NULL,
    "audioTaskId" INTEGER,
    "city" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "duration" TEXT,
    "contentType" TEXT NOT NULL,
    "title" TEXT,
    "artist" TEXT,
    "album" TEXT,
    "releaseYear" TEXT,
    "language" TEXT,
    "brand" TEXT,
    "product" TEXT,
    "category" TEXT,
    "sector" TEXT,
    "adType" TEXT,
    "programTitle" TEXT,
    "programGenre" TEXT,
    "seasonNumber" TEXT,
    "episodeNumber" TEXT,
    "programLang" TEXT,
    "sportsTitle" TEXT,
    "sportsName" TEXT,
    "sportsCategory" TEXT,
    "sportsLang" TEXT,
    "errorType" TEXT,

    CONSTRAINT "AudioData_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."AudioData" ADD CONSTRAINT "AudioData_audioTaskId_fkey" FOREIGN KEY ("audioTaskId") REFERENCES "public"."AudioTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
