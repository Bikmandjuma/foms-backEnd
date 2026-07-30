import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app.js";
import { initSocket } from "./realtime/socket.js";
import { prisma } from "./utils/prisma.js";

const port = process.env.PORT ?? 4000;
const app = createApp();
const httpServer = createServer(app);
initSocket(httpServer);

const server = httpServer.listen(port, () => {
  console.log(`Field Operation MS backend listening on port ${port}`);
  console.log(`Socket.io presence/notifications live on the same port`);
});

async function shutdown(): Promise<void> {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
