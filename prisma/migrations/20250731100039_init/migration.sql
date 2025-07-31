-- CreateTable
CREATE TABLE "public"."RadioPerCity" (
    "id" SERIAL NOT NULL,
    "city" TEXT NOT NULL,
    "radio" TEXT NOT NULL,

    CONSTRAINT "RadioPerCity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RadioPerCity_city_key" ON "public"."RadioPerCity"("city");
