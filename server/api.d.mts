import type { IncomingMessage, ServerResponse } from "node:http";

export function googleConfigured(): boolean;
export function handleApi(request: Request): Promise<Response | null>;
export function toWebRequest(req: IncomingMessage): Request;
export function writeNodeResponse(res: ServerResponse, response: Response): Promise<void>;
