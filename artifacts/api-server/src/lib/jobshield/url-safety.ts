import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

function isInIpv4Range(address: string, network: string, prefix: number): boolean {
  const ipNumber = ipv4ToNumber(address);
  const networkNumber = ipv4ToNumber(network);
  if (ipNumber === null || networkNumber === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipNumber & mask) === (networkNumber & mask);
}

function ipv6ToBigInt(address: string): bigint | null {
  const input = address.split("%")[0]?.toLowerCase();
  if (!input || input.includes(".")) return null;

  const halves = input.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return null;
  }

  const groups = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    return null;
  }

  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function isPublicIpv4(address: string): boolean {
  const blockedRanges: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return !blockedRanges.some(([network, prefix]) =>
    isInIpv4Range(address, network, prefix),
  );
}

function isPublicIpv6(address: string): boolean {
  const parsed = ipv6ToBigInt(address);
  if (parsed === null) return false;

  const firstGroup = Number(parsed >> 112n);
  const mappedPrefix = BigInt("0xffff") << 32n;
  if ((parsed >> 32n) === BigInt("0xffff")) {
    const embeddedIpv4 = [
      Number((parsed >> 24n) & 255n),
      Number((parsed >> 16n) & 255n),
      Number((parsed >> 8n) & 255n),
      Number(parsed & 255n),
    ].join(".");
    return isPublicIpv4(embeddedIpv4);
  }
  if ((parsed & (0xffn << 120n)) === 0xffn << 120n) return false; // multicast
  if ((parsed & (0xfe00n << 112n)) === 0xfc00n << 112n) return false; // unique local
  if ((parsed & (0xffc0n << 112n)) === 0xfe80n << 112n) return false; // link local
  if ((parsed & (0xffffn << 96n)) === 0x20010db8n << 96n) return false; // documentation
  if ((firstGroup & 0xe000) !== 0x2000) return false; // only global unicast
  return parsed !== 0n && parsed !== mappedPrefix;
}

function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

export function parsePublicHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid public web address.");
  }

  const hasSensitiveQueryParameter = [...url.searchParams.keys()].some((key) =>
    /(?:^|[_-])(?:access[_-]?token|api[_-]?key|auth|authorization|code|credential|jwt|password|secret|session|signature|sig|token)(?:$|[_-])/i.test(
      key,
    ),
  );
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !hostname ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".onion") ||
    hasSensitiveQueryParameter ||
    (url.port !== "" &&
      !((url.protocol === "http:" && url.port === "80") ||
        (url.protocol === "https:" && url.port === "443")))
  ) {
    throw new Error(
      hasSensitiveQueryParameter
        ? "Remove private or signed query parameters and submit a public listing URL."
        : "Only public HTTP or HTTPS job listing URLs are supported.",
    );
  }

  if (isIP(hostname) && !isPublicAddress(hostname)) {
    throw new Error("The URL must point to a public website, not a private network.");
  }

  return url;
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  const url = parsePublicHttpUrl(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return url;

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("This website could not be resolved to a public address.");
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new Error("This URL does not resolve exclusively to public addresses.");
  }
  return url;
}

export function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}
