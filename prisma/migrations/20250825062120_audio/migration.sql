/*
  Warnings:

  - Made the column `channel` on table `AudioItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `date` on table `AudioItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `start` on table `AudioItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `end` on table `AudioItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `program` on table `AudioItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `region` on table `AudioItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `type` on table `AudioItem` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."AudioItem" ALTER COLUMN "channel" SET NOT NULL,
ALTER COLUMN "date" SET NOT NULL,
ALTER COLUMN "start" SET NOT NULL,
ALTER COLUMN "end" SET NOT NULL,
ALTER COLUMN "program" SET NOT NULL,
ALTER COLUMN "region" SET NOT NULL,
ALTER COLUMN "type" SET NOT NULL;
