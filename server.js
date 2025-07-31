import { prisma } from './client/PrismaClients.js';
import { redis } from './client/redisClient.js';
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app=express();
app.use(express.json());
app.use(cors());
const JWT_SECRET = process.env.JWT_SECRET;

app.post("/app/register", async (req, res) => {
  console.log(req.body);
  try {
    const { username, password, role } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { username, password: hashedPassword, role },
    });
     await redis.hset(
      `user:${username}`,
      "password",
      hashedPassword,
      "role",
      role
    );
     res.status(200).json({ message: "Registration Successful" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

const port=3001;
app.listen(port,()=>console.log(`Backend running on ${port}`));

