import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";

const s3 = new S3Client({ region: process.env.AWS_REGION });

/**
 * Upload a file to S3
 * @param {string} bucket - S3 bucket name
 * @param {string} key - S3 key (path in bucket)
 * @param {Buffer|string} file - Either Buffer or local file path
 */
export default async function upload(bucket, key, file) {
  let body;

  if (Buffer.isBuffer(file)) {
    body = file; // already a buffer
  } else if (typeof file === "string") {
    // treat string as file path
    body = fs.createReadStream(file);
  } else {
    throw new Error("File must be a Buffer or a file path string");
  }

  const params = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: "audio/mpeg", // optional
  };

  await s3.send(new PutObjectCommand(params));

  return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}
