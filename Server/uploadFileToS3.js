import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Upload file to S3
export  async function uploadFileToS3(bucket, key, filePath) {
   console.log(bucket);
   const normalizedPath = path.resolve(filePath);
  const fileStream = fs.createReadStream(normalizedPath);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: "audio/mpeg", // for JSON you can use "application/json"
  });

  await s3.send(command);

  // Return pre-signed URL valid for 1 hour
  return await getPresignedUrl(bucket, key, 86400);
}

// Generate pre-signed URL for an existing file
async function getPresignedUrl(bucket, key, expiresIn = 86400) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const url = await getSignedUrl(s3, command, { expiresIn });
  return url;
}


