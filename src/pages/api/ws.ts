import type { NextApiRequest, NextApiResponse } from "next";
import type { Server as HTTPServer } from "http";
import type { Socket } from "net";
import { getIO } from "@/lib/websocket/server";

type SocketWithServer = Socket & { server: HTTPServer };
type NextApiResponseWithSocket = NextApiResponse & {
  socket: SocketWithServer;
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponseWithSocket,
) {
  getIO(res.socket.server);
  res.status(200).json({ ok: true });
}
