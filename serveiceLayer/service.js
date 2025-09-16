import { prisma } from '../client/PrismaClients.js';

export const deleteUser=async(username)=>{
      try{
           const res = await prisma.user.delete({where:{username:username}});
           return true;      
      }
      catch(err)
      {
         console.log(err);
         return false;
      }
}

export const updateUser = async (username, role) => {
  return await prisma.user.update({
    where: { username },
    data: { role },
  });
};

export const updateTask = async (audioTaskId) => {
  // ✅ 1. Mark the current audioTask as completed
  try{
  const updatedAudioTask = await prisma.audioTask.update({
    where: { id: Number(audioTaskId) },
    data: { status: "completed",completionDate: new Date() },
    select: { taskId: true }   // 👈 fetch taskId along with update
  });
  console.log(updatedAudioTask);

  const taskId = updatedAudioTask.taskId;  // 👈 we now have the parent taskId

  // ✅ 2. Check if all audioTasks under this task are completed
  const remaining = await prisma.audioTask.count({
    where: { taskId, status: { not: "completed" } }
  });

  // ✅ 3. If all are completed → update parent Task status
  if (remaining === 0) {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "completed" }
    });
  }
  return "update task ";
}
catch(err)
{
   console.log(err);
}
};


export const labelleddata = async() => {
         try{
              const label= await prisma.audioData.findMany({
              where: {
                audioTask: {
                  status: "completed",
                }
              },
              include: {
              audioTask: {
                include: {
                  task: true, // include parent Task
                },
              },
            },
            });
                console.log(label);
                return label;
         }
         catch(err)
         {
           console.log(err);
         }
    
};

export const labelldataByDate = async (date) => {
  try {
    // Convert input date string ("2025-09-16") into start and end of day
    console.log(date)
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const label = await prisma.audioData.findMany({
      where: {
        audioTask: {
          status: "completed",
          completionDate: {
            gte: start,
            lte: end,
          },
        },
      },
      include: {
        audioTask: {
          include: {
            task: true, // include parent Task
          },
        },
      },
    });

    console.log(label);
    return label;
  } catch (err) {
    console.log(err);
  }
};
