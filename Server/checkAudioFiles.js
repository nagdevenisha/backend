const fs = require('fs');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg');
const ffprobePath = require('@ffprobe-installer/ffprobe');
const ffmpeg = require('fluent-ffmpeg');


ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path);


const folderPath = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;

console.log("📁 Scanning folder:", folderPath);
console.log("📂 Files inside (fs check):", fs.existsSync(folderPath) ? "Exists ✅" : "Missing ❌");

const expectedDuration = 3600; // seconds
const expectedHours = Array.from({ length: 24 }, (_, i) => i); // 0 to 23

function parseFileDetails(fileName) {
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2}) (.+?) (\d{2})-00-00\.mp3$/);
  if (!match) return null;
  return {
    date: match[1],
    station: match[2].trim(),
    hour: parseInt(match[3])
  };
}

function getStartEndTime(hour) {
  const start = `${hour.toString().padStart(2, '0')}:00:00`;
  const endHour = (hour + 1) % 24;
  const end = `${endHour.toString().padStart(2, '0')}:00:00`;
  return { startTime: start, endTime: end };
}

function getDurationInSeconds(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(Math.floor(metadata.format.duration));
    });
  });
}

(async () => {
  const allFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.mp3'));
  console.log("📂 All files in folder:", allFiles);

  const audioFiles = allFiles.filter(f => parseFileDetails(f));
  if (audioFiles.length === 0) {
    console.log("❌ No valid audio files found in this folder.");
    return;
  }

  const { date, station } = parseFileDetails(audioFiles[0]);
  const metadataList = [];
  const foundHours = new Set();
  let totalDuration = 0;

  // Create processed_audio folder
  const processedFolder = path.join(folderPath, 'processed_audio');
  if (!fs.existsSync(processedFolder)) fs.mkdirSync(processedFolder);

  for (let fileName of audioFiles) {
    const details = parseFileDetails(fileName);
    if (!details) continue;

    const { hour } = details;
    const { startTime, endTime } = getStartEndTime(hour);
    const filePath = path.join(folderPath, fileName);
    const outputTrimmedPath = path.join(processedFolder, fileName);

    const duration = await getDurationInSeconds(filePath);
    const missingDuration = Math.max(0, 3600 - duration);
    totalDuration += duration;
    foundHours.add(hour);

    // Trim or copy to processed folder
    if (duration > 3600) {
      console.log(`✂️ Trimming ${fileName} from ${duration}s to 3600s`);
      await new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .setStartTime(0)
          .setDuration(3600)
          .output(outputTrimmedPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
    } 
    else if (duration < 3600) {
  // Add silence to reach 3600s
  const silencePath = path.join(processedFolder, `silence_${fileName}`);
  const finalOutputPath = outputTrimmedPath;

  const silenceDuration = 3600 - duration;
  console.log(`🧘 Padding ${fileName} with ${silenceDuration}s of silence`);

  // 1. Create silent audio
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input('anullsrc=channel_layout=stereo:sample_rate=44100')
      .inputFormat('lavfi')
      .duration(silenceDuration)
      .audioCodec('libmp3lame')
      .output(silencePath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  // 2. Concatenate real + silence
  const concatListPath = path.join(processedFolder, `concat_${fileName}.txt`);
  fs.writeFileSync(concatListPath, `file '${filePath.replace(/\\/g, '/')}'\nfile '${silencePath.replace(/\\/g, '/')}'`);

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions('-f', 'concat', '-safe', '0')
      .outputOptions('-c', 'copy')
      .output(finalOutputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  // Delete silence and temp concat list
  fs.unlinkSync(silencePath);
  fs.unlinkSync(concatListPath);
} 
    else {
      fs.copyFileSync(filePath, outputTrimmedPath);
    }

    metadataList.push({
      file: fileName,
      date,
      station,
      hour,
      startTime,
      endTime,
      duration,
      missing: false,
      missingDuration
    });
  }

  // Handle missing hours
  const missingHours = expectedHours.filter(h => !foundHours.has(h));
  for (let hour of missingHours) {
    const { startTime, endTime } = getStartEndTime(hour);
    metadataList.push({
      file: null,
      date,
      station,
      hour,
      startTime,
      endTime,
      duration: 0,
      missing: true,
      missingDuration: 3600
    });
  }

  // Sort metadata by hour
  metadataList.sort((a, b) => a.hour - b.hour);

  // Calculate summary values
  const totalMissingFiles = metadataList.filter(m => m.missing).length;
  const firstAvailable = metadataList.find(m => !m.missing);
  const lastAvailable = [...metadataList].reverse().find(m => !m.missing);

  const summary = {
    totalMissingFiles,
    startTime: firstAvailable ? firstAvailable.startTime : null,
    endTime: lastAvailable ? lastAvailable.endTime : null
  };

  // Wrap metadata + summary in one object
  const finalJson = {
    metadata: metadataList,
    ...summary
  };

  // Save metadata JSON
  const metadataPath = path.join(folderPath, `metadata.json`);
  fs.writeFileSync(metadataPath, JSON.stringify(finalJson, null, 2));
  console.log(`📝 Metadata saved to: ${metadataPath}`);

  const concatList = metadataList
    .filter(m => !m.missing)
    .map(m => `file '${path.join(processedFolder, m.file).replace(/\\/g, '/')}'`)
    .join('\n');
  const concatPath = path.join(processedFolder, 'concat.txt');
  fs.writeFileSync(concatPath, concatList);

  // Merge all into single file
  const mergedOutput = path.join(folderPath, `merged.mp3`);
  await new Promise((resolve, reject) => {
  ffmpeg()
    .input(concatPath)
    .inputOptions('-f', 'concat', '-safe', '0')
    .audioCodec('libmp3lame')   // 👈 re-encode
    .audioBitrate('192k')       // keep consistent bitrate
    .output(mergedOutput)
    .on('end', resolve)
    .on('error', reject)
    .run();
});

  console.log(`✅ Done! Total Missing: ${totalMissingFiles}`);

  // Final summary
  console.log(`✅ Analysis complete!`);
  console.log(`📁 Total valid audio files: ${audioFiles.length}`);
  console.log(`❌ Missing files: ${missingHours.length}`);
  console.log(`🕒 Total duration: ${totalDuration} seconds (${(totalDuration / 3600).toFixed(2)} hrs)`);
})();
