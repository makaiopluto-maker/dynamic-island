import type { IncomingMessage, ServerResponse } from "node:http";

export function serveInstaller(req: IncomingMessage, res: ServerResponse, root?: string): boolean;
