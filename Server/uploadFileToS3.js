// Server/s3.js
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_REGION, // e.g. "ap-south-1"
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function uploadFileToS3(bucket, key, filePath) {
  const fs = require("fs");
  const fileStream = fs.createReadStream(filePath);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,          // e.g. "audio/merged.mp3"
    Body: fileStream,
    ContentType: "audio/mpeg",
  });

  await s3.send(command);

  return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

module.exports = { uploadFileToS3 };
