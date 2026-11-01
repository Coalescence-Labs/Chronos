import { handleMcpRequest } from "@/lib/mcp/protocol";

/**
 * MCP endpoint for Organic's coding subagent: allowlisted, read-only git over local
 * repositories. 404 unless CHRONOS_MCP_TOKEN and CHRONOS_MCP_REPOS are set (docs/PRIVACY.md).
 */
export const POST = (request: Request) => handleMcpRequest(request);
export const GET = (request: Request) => handleMcpRequest(request);
export const DELETE = (request: Request) => handleMcpRequest(request);
