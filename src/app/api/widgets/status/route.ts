import { fetchGithubStatus, githubStatusSource } from "@/lib/providers/github-status";
import { getCachedWidget } from "@/lib/server/cache";
import { widgetResponse } from "@/lib/server/widget-response";

const TTL_MS = 5 * 60_000;

export async function GET() {
  return widgetResponse(githubStatusSource, () => getCachedWidget("github-status", TTL_MS, fetchGithubStatus), TTL_MS);
}
