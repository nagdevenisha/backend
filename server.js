import { prisma } from './client/PrismaClients.js';
import { redis } from './client/RedisClient.js';
import express from "express";
import { execFile } from 'child_process';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import clipAudio from './Server/clipAudio.js';
import { google } from 'googleapis';
import { uploadFileToS3 } from './Server/uploadFileToS3.js';




dotenv.config();
const app=express();
 app.use(cors());
 app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
//  const BASE_URL = "http://localhost:3001"; 
const BASE_URL = "https://backend-urlk.onrender.com";
const JWT_SECRET = process.env.JWT_SECRET;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_CLOUD_CREDENTIALS, // path to JSON key
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});
const sheets = google.sheets({ version: "v4", auth });
const drive = google.drive({ version: "v3", auth });


app.post("/app/register", async (req, res) => {
  console.log(req.body);
  try {
    const { username, password, role ,fullname } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { username, password: hashedPassword, role ,fullname },
    });
     await redis.hset(
      `user:${username}`,
      "password",
      hashedPassword,
      "role",
      role,
      "fullname",
      fullname
    );
     res.status(200).json({ message: "Registration Successful" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/login',async(req,res)=>{
  try{
         const {username}=req.query;
         const user=await prisma.user.findUnique({select:{fullname:true},where:{username:username}});
         console.log(user);
         
         return res.json({user});
  }catch(err)
  {
    console.log(err);
    
  }

})
app.post('/app/login',async(req,res)=>{
  try {
    const { username, password } = req.body;
    const cachedUser = await redis.hgetall(`user:${username}`);
    
    if (cachedUser && Object.keys(cachedUser).length > 0) {
      console.log("✅ Found user in Redis:", cachedUser);
      const isMatch = await bcrypt.compare(password, cachedUser.password);
      if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });
     const token = jwt.sign(
    { username, role: cachedUser.role }, 
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  return res.status(200).json({ 
    message: "Login successful (from cache)", 
    role: cachedUser.role, 
    token 
  });
    }

    // 2. If not in Redis, check Postgres (Supabase via Prisma)
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    // 3. Store back in Redis for future logins
    await redis.hset(
      `user:${username}`,
      "password", user.password,
      "role", user.role
    );

     const token = jwt.sign(
      { username, role: user.role },  // payload
      JWT_SECRET,
      { expiresIn: "1h" }            // token expiry
    );

    return res.status(200).json({ message: "Login successful (from DB)", role: user.role ,token});
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
})
app.get('/app/city', async (req, res) => {
  try {
   
    const cachedCities = await redis.get("cities");
    if (cachedCities) {
      console.log("✅ Returning cities from Redis cache");
      return res.status(200).json(JSON.parse(cachedCities));
    }
    const cities = await prisma.radioPerCity.findMany({ distinct: ["city"],
      select: { city: true }});

    if (!cities || cities.length === 0) {
      return res.status(404).json({ error: "No cities found" });
    }
    await redis.set("cities", JSON.stringify(cities));

    console.log("✅ Returning cities from DB & caching in Redis");
    return res.status(200).json(cities);

  } catch (err) {
    console.error("❌ Error fetching cities:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
});
app.get('/app/station',async(req,res)=>{
   try {
    const { city } = req.query;
     console.log(city);

    // 1. Check Redis first
    const cached = await redis.get(`stations:${city}`);
    if (cached) {
      console.log(`✅ Returning stations for ${city} from Redis`);
      return res.status(200).json(JSON.parse(cached));
    }

    // 2. Fetch stations from DB
    const stationObjects = await prisma.radioPerCity.findMany({
      where: { city },
      select: { radio: true }
    });

    if (!stationObjects || stationObjects.length === 0) {
      return res.status(404).json({ error: "No stations found for this city" });
    }

    // 3. Convert objects → array of station names
    const stations = stationObjects.map(item => item.radio);

    // 4. Cache in Redis
    await redis.set(`stations:${city}`, JSON.stringify(stations), "EX", 600);

    console.log(`✅ Returning ${stations.length} stations for ${city}`);
    return res.status(200).json(stations);

  } catch (err) {
    console.error("❌ Error fetching stations:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
})

app.get('/app/getmembers',async(req,res)=>{
     try {
    const cachedMembers = await redis.get("members");
    if (cachedMembers) {
      console.log("from cache");
      return res.json(JSON.parse(cachedMembers));
    }
    const users = await prisma.user.findMany({
      select: { fullname: true }, 
    });
    console.log(users);
    const members = users.map((u) => u.fullname);
    await redis.set("members", JSON.stringify(members), "EX", 600); 
    res.json(members);
  } catch (err) {
    console.error("❌ Error fetching members:", err);
    res.status(500).json({ error: "Failed to fetch members" });
  }
});



app.post('/app/saveteam',async(req,res)=>{
    try{
          const{teamName,leadName,station,city,members}=req.body;
  console.log(req.body);
   const memberNames = members.map((m) => m.value);
   console.log(memberNames);
  
    // Step 1: Save to DB
    const newTeam = await prisma.team.create({
      data: {
        teamName,
        leadName,
        station,
        city,
        members: {
          create: memberNames.map((name) => ({ name })),
        },
      },
      include: { members: true },
    });

    // Step 2: Save team in Redis
    const keyType = await redis.type(`teams:${newTeam.city}`);
    if (keyType !== 'list') {
      await redis.del(`teams:${newTeam.city}`);
    }
    await redis.rpush(`teams:${newTeam.city}`, JSON.stringify(newTeam));
    // Step 3: Update teams list cache
    const allTeams = await prisma.team.findMany({ include: { members: true } });
    await redis.set("teams", JSON.stringify(allTeams), "EX", 60 * 10);

    res.status(201).json({ message: "Team saved successfully", team: newTeam });
  } catch (err) {
    console.error("❌ Error saving team:", err);
    res.status(500).json({ error: "Failed to save team" });
  }
})

app.get('/app/teamspercity',async(req,res)=>{
    const{city}=req.query;
    console.log('city received:', city);

   try{
         const redisKey = `teams:${city}`;

    // 1. Check Redis
    const cachedData = await redis.lrange(redisKey, 0, -1);
    if (cachedData.length > 0) {
        const teams = cachedData.map(item => JSON.parse(item));
        return res.json(teams);
      }
    
    console.log("❌ Cache miss, fetching from DB");

    // 2. Fetch from DB
    const teams = await prisma.team.findMany({
      where: { city:city },
      include: { members: true }, // if you want members too
    });
    console.log(teams);
    // 3. Store in Redis (expire after 10 minutes)
    for (const team of teams) {
        await redis.rpush(redisKey, JSON.stringify(team));
    }
      await redis.expire(redisKey, 3600);
      res.json(teams);
   }
   catch(err)
   {
     console.log(err)
   }
})

app.post('/app/tasks',async(req,res)=>{

  const{city,station,leadName,teamName,tasks}=req.body;
  console.log(tasks);
  try
  {
    const team = await prisma.team.findFirst({
    where: {
      city,
      station,
      leadName,
      teamName
    }
  });
  await prisma.team.update({
  where: { id: team.id },
  data: {
    totalassignedtask: { increment: 1 }
  }
  });

  // 2️⃣ Find the member in that team
  const member = await prisma.member.findFirst({
    where: {
      teamId: team.id,
      name: tasks.assignto
    }
  });

  // 3️⃣ Create the task for that member & team
  const task = await prisma.task.create({
    data: {
      instructions:tasks.instructions,
      assignto:tasks.assignto,
      audio: Array.isArray(tasks.audio[0]) ? tasks.audio[0] : tasks.audio, 
      teamId: team.id,
      memberId: member.id,
    }
  });
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));

  await prisma.teamDailyStats.upsert({
    where: { teamId_date: { teamId: team.id, date: startOfDay } },
    update: { assigned: { increment: 1 } },
    create: { teamId: team.id, date: startOfDay, assigned: 1 }
  });

  if(task)
  {
     const tasks = await prisma.task.findMany({
        include: {
          team: true,   // fetch all team fields
          member: true, // fetch all member fields
        }
      });

     res.status(200).json(tasks);
  }
  }
  catch(err)
  {
     console.log(err);
  }

})

app.post('/app/gettasks', async (req, res) => {
  const { city, station, leadName, teamName } = req.body;

  try {
    // 1️⃣ Find the team matching the details
    const team = await prisma.team.findFirst({
      where: {
        city,
        station,
        leadName,
        teamName
      }
    });

    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    // 2️⃣ Fetch only tasks for this team

    const tasks = await prisma.task.findMany({
      where: {
        teamId: team.id
      },
      include: {
        team: true,
        member: true
      }
    });

    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching tasks" });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), "uploads"));
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // ✅ keep original filename
  },
});

const upload = multer({ storage });
app.post("/api/master/upload", upload.array("masterFiles"), async (req, res) => {
  const { type } = req.body;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: "No files uploaded" });
  }

  let results = [];

  for (const file of req.files) {
    const filePath = path.join(__dirname, "uploads", file.filename);
    const fpcalcPath = path.join(__dirname, "Server", "tools", "fpcalc.exe");

    try {
      const { stdout } = await new Promise((resolve, reject) => {
        execFile(fpcalcPath, ["-json", filePath], (err, stdout, stderr) => {
          if (err) return reject(err);
          resolve({ stdout });
        });
      });

      let fpData = JSON.parse(stdout);
      const { duration, fingerprint } = fpData;

      // Save in DB
      const record = await prisma.audioFingerprint.create({
        data: {
          fileName: file.originalname,
          filePath: `${BASE_URL}/uploads/${file.filename}`,
          duration,
          fingerprint,
        },
      });

      // Save .fp file
      const targetFolder =
        type === "master"
          ? "C:\\AFT\\Master_Audio"
          : path.join(__dirname, "Recording_Audio");

      if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

      const fpFilePath = path.join(
        targetFolder,
        path.parse(file.originalname).name + ".fp"
      );

      fs.writeFileSync(fpFilePath, fingerprint);

      console.log(`✅ .fp saved to ${fpFilePath}`);

      results.push({
        file: file.originalname,
        savedAs: filePath,
        fingerprint: fpData,
      });
    } catch (e) {
      console.error("❌ Error processing file:", file.originalname, e);
      results.push({
        file: file.originalname,
        error: e.message,
      });
    }
  }

  res.json({
    success: true,
    files: results,
  });
});

app.post("/upload", upload.array("files"), async (req, res) => {
  console.log("Uploaded files:", req.files);

  const scriptPath = path.resolve(__dirname, "Server/checkAudioFiles.js");
  const uploadsDir = path.join(__dirname, "uploads");

  // Run merging script
  execFile("node", [scriptPath, uploadsDir], async (err, stdout, stderr) => {
    if (err) {
      console.error("❌ execFile error:", err.message);
      console.error("stderr:", stderr);
      return res.status(500).json({ error: err.message });
    }

    // ✅ Check metadata.json
    const metaPath = path.join(uploadsDir, "metadata.json");
    if (!fs.existsSync(metaPath)) {
      return res.status(500).json({ error: "metadata.json not found" });
    }

    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    } catch (e) {
      return res.status(500).json({ error: "Invalid metadata.json" });
    }

    // merged file path
    const mergedFilePath = path.join(uploadsDir, "merged.mp3");

    // Run fpcalc on merged file
    const fpcalcPath = path.join(__dirname, "Server", "tools", "fpcalc");
    execFile(fpcalcPath, ["-json", mergedFilePath], async (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ fpcalc error: ${error.message}`);
        return res.status(500).json({ error: "Fingerprinting failed" });
      }

      let fpData;
      try {
        fpData = JSON.parse(stdout);
      } catch (e) {
        return res.status(500).json({ error: "Invalid fpcalc output" });
      }

      const { duration, fingerprint } = fpData;

      try {
        // Extract city, station, date from metadata or request
    
        let city = req.body.city || meta.city;
        let station = req.body.station || meta.station;
        let date = req.body.date || meta.date;

        if (Array.isArray(city)) city = city[0];
        if (Array.isArray(station)) station = station[0];
        if (Array.isArray(date)) date = date[0];

        const bucket = process.env.AWS_BUCKET_NAME;

        // ✅ Upload merged audio
        const audioKey = `${city}/${station}/${date}merged.mp3`;
        const s3UrlAudio = await uploadFileToS3(bucket, audioKey, mergedFilePath);

        // ✅ Upload metadata.json
        const jsonKey = `data/${city}/${station}/${date}.json`;
        const s3UrlJson = await uploadFileToS3(bucket, jsonKey, metaPath);

        // 🗑️ Cleanup processed folder
        const processedFolder = path.join(uploadsDir, "processed_audio");
        if (fs.existsSync(processedFolder)) {
          fs.rmSync(processedFolder, { recursive: true, force: true });
          console.log("🗑️ Deleted processed_audio folder");
        }

        // 🗑️ Delete local merged.mp3
        if (fs.existsSync(mergedFilePath)) {
          fs.unlinkSync(mergedFilePath);
          console.log("🗑️ Deleted local merged.mp3");
        }

        // 🗑️ Delete local metadata.json
          const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        if (fs.lstatSync(filePath).isFile()) {
          fs.unlinkSync(filePath); // delete file
        } else if (fs.lstatSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true }); // delete subfolder
        }
      }
      console.log("🗑️ Deleted all files in uploads folder, folder remains intact");

        // Save in DB
        const record = await prisma.recording.create({
          data: {
            fileName: "merged.mp3",
            filePath: s3UrlAudio,
            jsonPath: s3UrlJson,
            duration: duration,
            fingerprint: fingerprint,
          },
        });

        res.json({
          record,
          totalMissingFiles: meta.totalMissingFiles,
          startTime: meta.startTime,
          endTime: meta.endTime,
          mergedFile: s3UrlAudio,
          metadataFile: s3UrlJson,
        });
      } catch (dbErr) {
        console.error("DB save error:", dbErr);
        res.status(500).json({ error: "Failed to save recording in DB" });
      }
    });
  });
});



app.post('/audiomatching',async(req,res)=>{
try {
    const scriptsDir = path.join(process.cwd(), "server", "scripts");

    // 1. Batch identify all .fp recordings
    await new Promise((resolve, reject) => {
      execFile(path.join(scriptsDir, "5_AFT_Batch_Identify_All.bat"), [], (err) => {
        if (err) return reject(err);
        console.log("✅ Batch identification done");
        resolve();
      });
    });

    // 2. Parse logs → CSV
    await new Promise((resolve, reject) => {
      execFile("powershell.exe", [
        "-ExecutionPolicy", "Bypass",
        "-File", path.join(scriptsDir, "6_Parse_Match_Logs_to_CSV.ps1")
      ], (err) => {
        if (err) return reject(err);
        console.log("✅ CSV generated from logs");
        resolve();
      });
    });

    // 3. Read CSV into JSON
    const csvPath = path.join(scriptsDir, "results", "matches.csv");
    const records = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csvParser())
        .on("data", (row) => records.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    // 4. Save JSON in DB
    const saved = await prisma.matchResult.create({
      data: { jsonData: records }
    });

    // 5. Send JSON to frontend
    res.json({
      message: "✅ Matching complete",
      matchId: saved.id,
      results: records
    });

  } catch (err) {
    console.error("❌ Match flow error:", err);
    res.status(500).json({ error: err.message });
  }
}
)

app.get("/clip", (req, res) => {
  let { filePath, startTime, endTime } = req.query;

  console.log(filePath,startTime,endTime)
  // Convert times to seconds if needed
   if (filePath.startsWith("http")) {
    filePath = filePath.split("/uploads/")[1]; // "1755596284376-639066989.mp3"
  }

  const resolvedPath = path.join(__dirname, "uploads", filePath);

  // Calculate duration
  const [sh, sm, ss] = startTime.split(":").map(Number);
  const [eh, em, es] = endTime.split(":").map(Number);
  const startSeconds = sh * 3600 + sm * 60 + ss;
  const endSeconds = eh * 3600 + em * 60 + es;
  const duration = endSeconds - startSeconds;

  ffmpeg(resolvedPath)
    .setStartTime(startTime)
    .setDuration(duration)
    .format("mp3")
    .on("error", (err) => {
      console.error("FFmpeg error:", err.message);
      res.status(500).send("Error processing audio");
    })
    .pipe(res, { end: true });

  });
  

app.get('/app/alltasks',async(req,res)=>{
    try{
       const team = await prisma.task.findMany({
            include: {
              team: true,
              member: true,
            },
          });
        if(team)
        {
           res.json(team);
        }
    }
    catch(err)
    {
       console.log(err);
    }
})

app.get("/clips", (req, res) => {
  let { filePath, startTime, endTime, mergedStart } = req.query;
  // mergedStart = when the merged file actually begins on station clock (e.g. "06:00:00")

  
  if (filePath.startsWith("http")) {
    filePath = filePath.split("/uploads/")[1];
  }
  const resolvedPath = path.join(__dirname, "uploads", filePath);

  // helper to convert HH:mm:ss → seconds
  const toSeconds = (t) => {
    const [h, m, s] = t.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  };

  const mergedStartSec = toSeconds(mergedStart);  // e.g. 21600 (06:00:00)
  const reqStartSec = toSeconds(startTime);       // e.g. 24323 (06:45:23)
  const reqEndSec = toSeconds(endTime);           // e.g. 24380 (06:46:20)

  // Shifted times relative to merged file timeline
  let clipStartSec = reqStartSec - mergedStartSec;
  let clipEndSec = reqEndSec - mergedStartSec;

  // handle overnight wrap (e.g. mergedStart=06:00, endTime=00:00 next day)
  if (clipStartSec < 0) clipStartSec += 24 * 3600;
  if (clipEndSec < 0) clipEndSec += 24 * 3600;

  const duration = clipEndSec - clipStartSec;

  console.log(`Request: ${startTime}–${endTime}`);
  console.log(`Merged starts at: ${mergedStart}`);
  console.log(`Actual clip inside file: ${clipStartSec}s → ${clipEndSec}s`);

  ffmpeg(resolvedPath)
    .setStartTime(clipStartSec) // now in file-relative seconds
    .setDuration(duration)
    .format("mp3")
    .on("error", (err) => {
      console.error("FFmpeg error:", err.message);
      res.status(500).send("Error processing audio");
    })
    .pipe(res, { end: true });
});

app.post('/app/savedata',async(req,res)=>{
   try{
       const{formData}=req.body;
       console.log(formData);
      const insertedRecord = await prisma.audioItem.create({
          data: {
            id: formData.id,                       // generate new ID
            channel: formData.channel,            // required
            date: new Date(formData.date), // required DateTime
            start: formData.start   ,      // required
            end: formData.end,             // required
            program: formData.program ,         // required
            region: formData.region,            // required
            type: formData.type ,                  // required
            audio: formData.audio || "",                // optional
          }
        });
        if(insertedRecord)
        {
           res.json({msg:"Record save"}).status(200);

        }
   }
   catch(err)
   { 
      console.log(err);
   }
})

app.get('/app/getlabel',async(req,res)=>{
     try{
             const{city,station,date}=req.query;
             console.log(typeof(city),typeof(station))

             const response=await prisma.audioItem.findMany({where:{region: { contains: city.trim(), mode: "insensitive" },
              channel: { contains: station.trim(), mode: "insensitive" },}});
             console.log("station:",station,"city:",city);
            //  console.log(response)
             if(response)
             {
              return res.json(response);
             }
     }
     catch(err)
     {
       console.log(err);
       return res.json({msg:"Data not found"});
     }
})

app.post('/app/minuteclip',async(req,res)=>{
   try {
    const { audio } = req.body; // audio file name, e.g. "merged.mp3"

    const inputFile = path.resolve(__dirname,"backend" ,"../uploads", audio);
    const outputDir = path.resolve(__dirname, "clips");

    await clipAudio(inputFile, outputDir, 300); // 300s = 5min clips

    res.status(200).json({ success: true, message: "Clips created successfully" });
  } catch (err) {
    console.error("❌ API Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
})


app.post('/app/savemetadata', async (req, res) => {
  try {
    const { metadata } = req.body;
    if (!metadata || !metadata.city || !metadata.date || !metadata.channel) {
      return res.status(400).json({ success: false, message: "City, date, and channel are required" });
    }

    console.log("Received metadata:", metadata);

    // --- 1. Find the city folder inside your personal Drive ---
    const topLevelFolderId = "1oz5sL1U0cg7TH2rRm6gkCePVML35Ut-z"; // Radio Metadata
    const folderRes = await drive.files.list({
      q: `'${topLevelFolderId}' in parents and name='${metadata.city}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name)",
    });

    if (folderRes.data.files.length === 0) {
      return res.status(400).json({ success: false, message: "City folder not found" });
    }

    const cityFolderId = folderRes.data.files[0].id;

    // --- 2. Build sheet name dynamically (manually created sheet) ---
    const sheetName = `${metadata.date}_${metadata.channel}_${metadata.city}`;

    // --- 3. Find the existing sheet in the city folder ---
    const driveRes = await drive.files.list({
      q: `'${cityFolderId}' in parents and name='${sheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: "files(id, name)",
    });

    if (driveRes.data.files.length === 0) {
      return res.status(400).json({ success: false, message: `Sheet '${sheetName}' not found in folder '${metadata.city}'` });
    }

    const spreadsheetId = driveRes.data.files[0].id;

    // --- 4. Append metadata row ---
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A2", // append below existing data
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [Object.values(metadata)] },
    });

    res.json({
      success: true,
      message: "Metadata appended successfully",
      cityFolderId,
      spreadsheetId,
    });

  } catch (err) {
    console.error("Error saving metadata:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});



const port=3001;
app.listen(port,()=>console.log(`Backend running on ${port}`));

