import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import ffprobePath from "@ffprobe-installer/ffprobe";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs";
import os from "os";
import path from "path";


ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path);

const s3 = new S3Client({ region: process.env.AWS_REGION });

async function downloadFile(bucket, key) {
  const tmpPath = path.join(os.tmpdir(), path.basename(key));
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpPath);
    Body.pipe(file);
    Body.on("error", reject);
    file.on("finish", () => resolve(tmpPath));
  });
}

async function uploadFile(bucket, key, filePath) {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(filePath),
    },
  });
  await upload.done();
  return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

export default async function clipAudio(bucket, key,city,date,station, baseName = "clip") {
  const localFile = await downloadFile(bucket, key);

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(localFile, async (err, metadata) => {
      if (err) return reject(err);

      const duration = Math.floor(metadata.format.duration);
      const segmentLength = 300; // 5 minutes
      const clipUrls = [];

      for (let start = 0, index = 0; start < duration; start += segmentLength, index++) {
        const outputPath = path.join(os.tmpdir(), `${baseName}_${index}.mp3`);
        await new Promise((res, rej) => {
          ffmpeg(localFile)
            .setStartTime(start)
            .duration(segmentLength)
            .output(outputPath)
            .on("end", res)
            .on("error", rej)
            .run();
        });

        const s3Key = `clips/${city}/${station}/${date}/${baseName}_${index}.mp3`;
        const url = await uploadFile(bucket, s3Key, outputPath);
        clipUrls.push(url);
        fs.unlinkSync(outputPath); // cleanup temp clip
      }

      fs.unlinkSync(localFile); // cleanup full file
      resolve(clipUrls);
    });
  });
}
