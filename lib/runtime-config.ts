import { env } from "cloudflare:workers";

const DEFAULT_HOSTS = ["go.example.com", "ai.example.com"] as const;
const HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function sourceHosts(): [string, string] {
  const configured = env.JJ_LINKS_SOURCE_HOSTS
    ?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (!configured?.length) return [...DEFAULT_HOSTS];
  if (configured.length !== 2 || new Set(configured).size !== 2 || configured.some((host) => !HOST_PATTERN.test(host))) {
    throw new Error("JJ_LINKS_SOURCE_HOSTS must contain exactly two distinct comma-separated hostnames.");
  }
  return [configured[0], configured[1]];
}

export function isAllowedHost(host: string): boolean {
  return sourceHosts().includes(host.toLowerCase());
}

export function hostLabel(host: string): string {
  return host.split(".")[0] || host;
}
