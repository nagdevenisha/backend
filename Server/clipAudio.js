// Server/clipAudio.js
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export default async function splitAudio(inputFile, outputDir, clipDuration = 300) {
  return new Promise((resolve, reject) => {
    // Ensure clips folder exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    ffmpeg(inputFile)
      .outputOptions([
        "-f", "segment",
        "-segment_time", clipDuration.toString(),
        "-c", "copy"
      ])
      .output(`${outputDir}/clip_%03d.mp3`) // padded numbers
      .on("end", () => {
        console.log("✅ Audio split successfully!");
        resolve("done");
      })
      .on("error", (err) => {
        console.error("❌ Error:", err.message);
        reject(err);
      })
      .run();
  });
}
