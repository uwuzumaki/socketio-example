import express from "express";
import { createServer } from "http";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const db = await open({
  filename: "chat.db",
  driver: sqlite3.Database,
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_offset TEXT UNIQUE,
      content TEXT
  );
`);

const app = express();
const server = createServer(app);
const io = new Server(server, { connectionStateRecovery: {} });

const __dirname = dirname(fileURLToPath(import.meta.url));

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

io.on("connection", async (socket) => {
  socket.on("chat message", async (msg, clientOffset, callback) => {
    console.log(msg);
    let result;
    try {
      // store the message in the database
      result = await db.run(
        "INSERT INTO messages (content, client_offset) VALUES (?)",
        msg,
        clientOffset
      );
    } catch (e) {
      console.log("error");
      if (e.errno === 19) {
        callback();
      } else {
      }
      // TODO handle the failure
      return;
    }
    // include the offset with the message
    io.emit("chat message", msg, result.lastID);
    callback();
  });

  if (!socket.recovered) {
    // if the connection state recovery was not successful
    try {
      await db.each(
        "SELECT id, content FROM messages WHERE id > ?",
        [socket.handshake.auth.serverOffset || 0],
        (_err, row) => {
          socket.emit("chat message", row.content, row.id);
        }
      );
    } catch (e) {
      // something went wrong
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port: ${PORT}`);
});
