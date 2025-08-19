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



dotenv.config();

const app=express();
app.use(express.json());
// app.use(cors());
 app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
// const BASE_URL = "http://localhost:3001"; 
const BASE_URL = "https://backend-urlk.onrender.com";
const JWT_SECRET = process.env.JWT_SECRET;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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
  filename: (req, file, cb) => {
    // Keep original extension
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });
app.post("/api/master/upload", upload.single("masterFile"), (req, res) => {

   const{type}= req.body;
     const filePath = path.join(__dirname, "uploads", req.file.filename);
  const fpcalcPath = path.join(__dirname,'Server',"tools", "fpcalc.exe");

  execFile(fpcalcPath, ["-json", filePath], async(err, stdout, stderr) => {
    if (err) {
      console.error("❌ Error:", err);
      return res.status(500).json({ success: false, error: stderr || err.message });
    }

     let fpData;
    try {
      fpData = JSON.parse(stdout); // parse fpcalc output
    } catch (e) {
      return res.status(500).json({ success: false, error: "Invalid fpcalc output" });
    }

    const { duration, fingerprint } = fpData;
    const record = await prisma.audioFingerprint.create({
    data: {
      fileName: req.file.originalname,
      filePath: `${BASE_URL}/uploads/${req.file.filename}`,
      duration: duration,
      fingerprint: fingerprint,
    },
  });
   const targetFolder =
        type === "master"
          ? "C:\\AFT\\Master_Audio"
          : path.join(__dirname, "Recording_Audio");

      if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

      const fpFilePath = path.join(
        targetFolder,
        path.parse(req.file.originalname).name + ".fp"
      );

      fs.writeFileSync(fpFilePath, fingerprint);

      console.log(`✅ .fp saved to ${fpFilePath}`);


    res.json({
      success: true,
      file: req.file.originalname,
      savedAs: filePath,
      fingerprint: stdout.trim(), // JSON fingerprint from fpcalc
    });
  });
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log(req.file);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = path.join(__dirname,"uploads", req.file.filename);
   const fpcalcPath = path.join(__dirname, "Server", "tools", "fpcalc.exe");

    const recordingAudioDir = path.join(__dirname, "Recording_Audio");

    // Make sure Recording_Audio folder exists
    if (!fs.existsSync(recordingAudioDir)) {
      fs.mkdirSync(recordingAudioDir);
    }

    execFile(fpcalcPath, ["-json", filePath], async (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Script error: ${error.message}`);
        return res.status(500).json({ error: "Fingerprinting failed" });
      }

      console.log(`✅ Script output: ${stdout}`);

      let fpData;
      try {
        fpData = JSON.parse(stdout); // parse fpcalc output
      } catch (e) {
        return res
          .status(500)
          .json({ success: false, error: "Invalid fpcalc output" });
      }

      const { duration, fingerprint } = fpData;
       const fpFileName = req.file.originalname + ".fp";
      const fpFilePath = path.join(recordingAudioDir, fpFileName);
      fs.writeFileSync(fpFilePath, fingerprint);

      try {
        const record = await prisma.recording.create({
          data: {
            fileName: req.file.originalname,
            filePath: `${BASE_URL}/uploads/${req.file.filename}`,
            duration: duration,
            fingerprint: fingerprint,
          },
        });

        res.json(record); // ✅ send response only after saving
      } catch (dbErr) {
        console.error("DB save error:", dbErr);
        res.status(500).json({ error: "Failed to save recording in DB" });
      }
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload recording" });
  }
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
  
const port=3001;
app.listen(port,()=>console.log(`Backend running on ${port}`));

