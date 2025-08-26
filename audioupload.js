// insertData.js
const {PrismaClient} = require("./generated/prisma");
const fs =require ("fs");
const segment =require('./Server/Segment.json');


const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.audioItem.createMany({
      data: segment.map((i) => ({
        id: i.id,
        audio: i.audio,
        channel: i.channel,
        date: new Date(i.date),
        start: i.start,
        end: i.end,
        program: i.program,
        region: i.region,
        type: i.type,
      })),
      skipDuplicates: true,
    });
    console.log("✅ Inserted all records");
  } catch (err) {
    console.error("❌ Error inserting data:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
  