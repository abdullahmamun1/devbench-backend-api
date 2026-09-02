import app from "./app";
import "dotenv/config";
import config from "./config";
import { prisma } from "./lib/prisma";
import { seedAllRoles } from "./utils/seed";

const PORT = config.port;

async function main() {
  try {
    await prisma.$connect();
    console.log("Connected to database successfully!!");
    await seedAllRoles();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Error starting the server:", error);
    await prisma.$disconnect;
    process.exit(1);
  }
}

main();
