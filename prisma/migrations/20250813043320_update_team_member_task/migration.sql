-- CreateTable
CREATE TABLE "public"."TeamDailyStats" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "assigned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeamDailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamDailyStats_teamId_date_key" ON "public"."TeamDailyStats"("teamId", "date");

-- AddForeignKey
ALTER TABLE "public"."TeamDailyStats" ADD CONSTRAINT "TeamDailyStats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
