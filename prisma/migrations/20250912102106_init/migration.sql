/*
  Warnings:

  - A unique constraint covering the columns `[city,radio]` on the table `RadioPerCity` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "public"."AudioTask" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "AudioTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RadioPerCity_city_radio_key" ON "public"."RadioPerCity"("city", "radio");

-- AddForeignKey
ALTER TABLE "public"."AudioTask" ADD CONSTRAINT "AudioTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
