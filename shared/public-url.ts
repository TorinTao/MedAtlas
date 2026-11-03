export function safePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return (
      host !== "localhost" &&
      !host.endsWith(".local") &&
      !/^\[.*\]$/.test(host) &&
      !/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        host,
      ) &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(host)
    );
  } catch {
    return false;
  }
}
