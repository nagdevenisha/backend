import { prisma } from './client/PrismaClients.js';
import { redis } from './client/RedisClient.js';
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app=express();
app.use(express.json());
// app.use(cors());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
const JWT_SECRET = process.env.JWT_SECRET;

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

const port=3001;
app.listen(port,()=>console.log(`Backend running on ${port}`));

