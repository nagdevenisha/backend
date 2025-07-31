/*
  Warnings:

  - A unique constraint covering the columns `[radio]` on the table `RadioPerCity` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."RadioPerCity_city_key";

-- CreateIndex
CREATE UNIQUE INDEX "RadioPerCity_radio_key" ON "public"."RadioPerCity"("radio");
