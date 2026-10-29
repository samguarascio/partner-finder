import type { Partner, Profile } from "./types";

export async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
  if (!res.ok || data.error) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

// A LinkedIn people search for the role at the company. No scraping, just a link.
export function linkedinSearchUrl(p: Pick<Partner, "contact_role" | "name">) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${p.contact_role} ${p.name}`)}`;
}

function csvCell(value: string | number | null | undefined) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(profile: Profile | null, partners: Partner[]) {
  const header = [
    "Company",
    "Category",
    "Fit score",
    "Why they'd care",
    "Contact role",
    "LinkedIn search",
    "Website",
    "Source URL",
    "Email subject",
    "Email body",
  ];
  const rows = partners.map((p) => [
    p.name,
    p.category,
    p.fit_score,
    p.why,
    p.contact_role,
    linkedinSearchUrl(p),
    p.website,
    p.source_url,
    p.email?.subject,
    p.email?.body,
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `partners-${profile?.domain || "export"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
