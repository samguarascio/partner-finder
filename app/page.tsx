"use client";

import {
  ArrowRight,
  Copy,
  Download,
  Globe,
  Keyboard,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  ThumbsDown,
  Undo2,
  UserSearch,
  X,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { DraftStatus, Label, LabelDot, ScoreBars } from "@/components/app/icons";
import { Shortcut } from "@/components/app/shortcut";
import { ShortcutsSheet } from "@/components/app/shortcuts-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { api, downloadCsv, linkedinSearchUrl } from "@/lib/client";
import type { Category, Email, Exclusions, Partner, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "partner-finder-v1";

const LABEL_COLORS = ["#5e6ad2", "#26b5ce", "#4cb782", "#f2c94c", "#f2994a", "#eb5757", "#bb87fc", "#95a2b3"];

// Linear-style field: dark fill, hairline border, no glow on focus.
const field =
  "rounded-md border-border bg-[#141517] text-[13px] md:text-[13px] text-foreground placeholder:text-tertiary-foreground focus-visible:border-[#41444c] focus-visible:ring-0 dark:bg-[#141517]";

type Step = "profile" | "categories" | "partners" | "more" | "email";

interface SavedState {
  url: string;
  profile: Profile | null;
  categories: Category[];
  partners: Partner[];
}

function Section({
  step,
  title,
  hint,
  action,
  children,
  transitionName,
}: {
  transitionName?: string;
  step: number;
  title: React.ReactNode;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
      style={transitionName ? { viewTransitionName: transitionName } : undefined}
    >
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2">
        <span className="grid size-5 place-items-center rounded-[5px] border border-border text-[11px] font-medium text-muted-foreground tabular-nums">
          {step}
        </span>
        <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
        {hint && <span className="text-[12px] text-tertiary-foreground">{hint}</span>}
        <div className="ml-auto flex items-center gap-2">{action}</div>
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">{children}</label>;
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" /> {children}
    </div>
  );
}

function ErrorLine({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[13px] text-destructive">{message}</p>;
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{Math.max(0, Math.round((now - since) / 1000))}s</span>;
}

function domain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "profile" | "categories" | "partners" | "more">(null);
  const [busySince, setBusySince] = useState(0);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [error, setError] = useState<{ step: Step; message: string } | null>(null);
  const [searchNote, setSearchNote] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  // The row the keyboard acts on (J/K to move).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const urlInput = useRef<HTMLInputElement>(null);

  // Restore the last session from this browser.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as SavedState;
        setUrl(s.url ?? "");
        setProfile(s.profile ?? null);
        setCategories(s.categories ?? []);
        setPartners(s.partners ?? []);
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      const s: SavedState = { url, profile, categories, partners };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {}
  }, [loaded, url, profile, categories, partners]);

  const colorOf = (name: string) => {
    const i = categories.findIndex((c) => c.name === name);
    return LABEL_COLORS[(i < 0 ? categories.length : i) % LABEL_COLORS.length];
  };

  function exclusions(list: Partner[]): Exclusions {
    return {
      domains: list.flatMap((p) => (p.website ? [p.website] : [])),
      names: list.map((p) => p.name),
    };
  }

  // Applies a change to the partner list so rows slide into place.
  function withTransition(update: () => void) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduceMotion) {
      update();
      return;
    }
    document.startViewTransition(() => flushSync(update));
  }

  // Shows one category's partners.
  function applyFilter(next: string | null) {
    withTransition(() => {
      setFilter(next);
      if (next) setOpenId((id) => (partners.find((p) => p.id === id)?.category === next ? id : null));
    });
  }

  async function run(step: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(step);
    setBusySince(Date.now());
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError({ step, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  function analyze(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim() || busy) return;
    run("profile", async () => {
      const res = await api<{ profile: Profile }>("/api/profile", { url });
      setProfile(res.profile);
      setCategories([]);
      setPartners([]);
      setOpenId(null);
    });
  }

  function findCategories() {
    if (!profile || busy) return;
    run("categories", async () => {
      const res = await api<{ categories: Category[] }>("/api/categories", { profile });
      setCategories(res.categories);
      setPartners([]);
      setOpenId(null);
    });
  }

  function findPartners() {
    if (!profile || busy) return;
    const cats = categories.filter((c) => c.name.trim() && c.queries.some((q) => q.trim()));
    run("partners", async () => {
      const res = await api<{ partners: Partner[]; candidateCount: number; dropped: number }>(
        "/api/partners",
        { profile, categories: cats, exclude: exclusions(rejected) },
      );
      // Rejected companies stay on record so later searches keep skipping them.
      setPartners([...res.partners, ...rejected]);
      setOpenId(null);
      setFilter(null);
      setSearchNote(
        `Picked from ${res.candidateCount} search results` +
          (res.dropped ? ` · ${res.dropped} picks dropped because they weren't in the cited result` : ""),
      );
    });
  }

  // Digs deeper in the filtered category (or all of them), skipping known companies.
  function findMore() {
    if (!profile || busy) return;
    const cats = categories.filter(
      (c) => (!filter || c.name === filter) && c.name.trim() && c.queries.some((q) => q.trim()),
    );
    if (!cats.length) {
      setError({ step: "more", message: `"${filter}" isn't in the categories above any more. Add it back to search it.` });
      return;
    }
    run("more", async () => {
      const res = await api<{ partners: Partner[]; dropped: number }>("/api/partners", {
        profile,
        categories: cats,
        exclude: exclusions(partners),
        more: true,
      });
      if (!res.partners.length) {
        toast("No new partners found. Try editing the search queries in step 2.");
        return;
      }
      withTransition(() =>
        setPartners((ps) => [...ps, ...res.partners].sort((a, b) => b.fit_score - a.fit_score)),
      );
      toast.success(`Found ${res.partners.length} more partner${res.partners.length === 1 ? "" : "s"}`);
    });
  }

  function setRejected(p: Partner, value: boolean) {
    withTransition(() => {
      setPartners((ps) => ps.map((x) => (x.id === p.id ? { ...x, rejected: value } : x)));
      if (value && openId === p.id) setOpenId(null);
    });
    if (value) {
      toast(`Marked ${p.name} as not a fit`, {
        description: "Hidden, left out of exports, and skipped in future searches.",
        action: { label: "Undo", onClick: () => setRejected(p, false) },
      });
    }
  }

  async function generateEmail(partner: Partner) {
    if (!profile) return;
    setDrafting(partner.id);
    setError(null);
    try {
      const { email } = await api<{ email: Email }>("/api/email", { profile, partner });
      setPartners((ps) => ps.map((p) => (p.id === partner.id ? { ...p, email } : p)));
    } catch (e) {
      setError({ step: "email", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setDrafting(null);
    }
  }

  function toggleRow(p: Partner) {
    const next = openId === p.id ? null : p.id;
    setSelectedId(p.id);
    setOpenId(next);
    if (next && !p.email && drafting !== p.id) generateEmail(p);
  }

  async function copyEmail(p: Partner) {
    if (!p.email) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${p.email.subject}\n\n${p.email.body}`);
      toast.success(`Copied email to ${p.name}`);
    } catch {
      toast.error("Couldn't access the clipboard.");
    }
  }

  function updateProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
  }

  function updateCategory(i: number, patch: Partial<Category>) {
    setCategories((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  function updateEmail(id: string, patch: Partial<Email>) {
    setPartners((ps) => ps.map((p) => (p.id === id && p.email ? { ...p, email: { ...p.email, ...patch } } : p)));
  }

  function reset() {
    setUrl("");
    setProfile(null);
    setCategories([]);
    setPartners([]);
    setOpenId(null);
    setFilter(null);
    setError(null);
  }

  // ⌘↵ runs whichever step comes next.
  function nextStep() {
    if (!profile) analyze();
    else if (!categories.length) findCategories();
    else if (!partners.length) findPartners();
  }

  const openPartner = partners.find((p) => p.id === openId);
  const active = partners.filter((p) => !p.rejected);
  const rejected = partners.filter((p) => p.rejected);
  const visible = filter ? active.filter((p) => p.category === filter) : active;

  // Category order for the 1–9 keys: as listed in step 2, then any others.
  const filterOrder = [
    ...categories.map((c) => c.name).filter((n) => active.some((p) => p.category === n)),
    ...[...new Set(active.map((p) => p.category))].filter((n) => !categories.some((c) => c.name === n)),
  ];
  const selected = visible.find((p) => p.id === selectedId);
  // Keys act on the open email first, then the selected row.
  const current = (openPartner && !openPartner.rejected ? openPartner : undefined) ?? selected;

  useEffect(() => {
    if (selectedId) document.querySelector(`[data-row-id="${selectedId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function move(delta: number) {
    if (!visible.length) return;
    const i = visible.findIndex((p) => p.id === selectedId);
    const next = i < 0 ? (delta > 0 ? 0 : visible.length - 1) : Math.max(0, Math.min(visible.length - 1, i + delta));
    setSelectedId(visible[next].id);
  }

  function rejectCurrent() {
    if (!current) return;
    const i = visible.findIndex((p) => p.id === current.id);
    const next = visible[i + 1] ?? visible[i - 1];
    setRejected(current, true);
    setSelectedId(next?.id ?? null);
  }

  function openLink(url: string | null | undefined) {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const hasRows = visible.length > 0 && !shortcutsOpen;
  useHotkeys([
    { keys: "mod+enter", allowInInput: true, enabled: !shortcutsOpen, handler: nextStep },
    {
      keys: "escape",
      allowInInput: true,
      enabled: !shortcutsOpen,
      handler: (e) => {
        const el = e.target as HTMLElement;
        if (["INPUT", "TEXTAREA"].includes(el.tagName)) el.blur();
        else if (openId) setOpenId(null);
        else if (filter) applyFilter(null);
        else if (selectedId) setSelectedId(null);
      },
    },
    { keys: ["?", "shift+/"], enabled: !shortcutsOpen, handler: () => setShortcutsOpen(true) },
    // ⌘K works from anywhere, including text fields, and toggles the sheet.
    { keys: "mod+k", allowInInput: true, handler: () => setShortcutsOpen((o) => !o) },
    {
      keys: "/",
      enabled: !shortcutsOpen,
      handler: () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
        urlInput.current?.focus();
        urlInput.current?.select();
      },
    },
    // Partner rows
    { keys: ["j", "arrowdown"], enabled: hasRows, handler: () => move(1) },
    { keys: ["k", "arrowup"], enabled: hasRows, handler: () => move(-1) },
    { keys: ["enter", "o"], enabled: hasRows && !!selected, handler: () => selected && toggleRow(selected) },
    {
      keys: "e",
      enabled: hasRows && !!current,
      handler: () => {
        if (!current) return;
        if (openId !== current.id) toggleRow(current);
        else if (!current.email) generateEmail(current);
      },
    },
    { keys: "r", enabled: hasRows && !!current?.email, handler: () => current && generateEmail(current) },
    { keys: "c", enabled: hasRows && !!current?.email, handler: () => current && copyEmail(current) },
    { keys: "x", enabled: hasRows && !!current, handler: rejectCurrent },
    { keys: "l", enabled: hasRows && !!current, handler: () => current && openLink(linkedinSearchUrl(current)) },
    {
      keys: "w",
      enabled: hasRows && !!current,
      handler: () => current && openLink(current.website ?? current.source_url),
    },
    // List
    {
      keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
      enabled: active.length > 0 && !shortcutsOpen,
      handler: (e) => {
        const name = filterOrder[Number(e.key) - 1];
        if (name) applyFilter(filter === name ? null : name);
      },
    },
    { keys: "0", enabled: !!filter && !shortcutsOpen, handler: () => applyFilter(null) },
    { keys: "f", enabled: partners.length > 0 && !busy && !shortcutsOpen, handler: findMore },
    {
      keys: "shift+e",
      enabled: active.length > 0 && !shortcutsOpen,
      handler: () => downloadCsv(profile, active),
    },
  ]);

  const errorFor = (step: Step) => (error?.step === step ? error.message : undefined);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-[1080px] items-center gap-2.5 px-6">
          <span className="grid size-5 place-items-center rounded-[5px] bg-primary text-[10px] font-semibold text-white">
            PF
          </span>
          <span className="text-[13px] font-medium text-foreground">Partner Finder</span>
          {profile && (
            <>
              <span className="text-tertiary-foreground">/</span>
              <span className="truncate text-[13px] text-muted-foreground">{profile.company_name}</span>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShortcutsOpen(true)}
            className="ml-auto text-[12px] text-muted-foreground"
          >
            <Keyboard /> Shortcuts <Shortcut keys="mod+k" />
          </Button>
          {profile && (
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy !== null} className="text-[12px] text-muted-foreground">
              <RotateCcw /> Start over
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-[1080px] flex-col gap-5 px-6 pt-12 pb-24">
        <div className="mb-2">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground">Find partners for a startup</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Paste a company&apos;s website. Get real partner companies, ranked, with an outreach draft for each.
          </p>
          <form
            onSubmit={analyze}
            className="mt-6 flex h-11 max-w-[640px] items-center gap-2 rounded-lg border border-border bg-card pr-1.5 pl-3 shadow-[0_1px_2px_rgba(0,0,0,0.3)] focus-within:border-[#41444c]"
          >
            <Globe className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={urlInput}
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Company URL, e.g. gini.health"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-tertiary-foreground"
            />
            <Button type="submit" size="sm" disabled={!url.trim() || busy !== null} className="h-8 rounded-md px-3 text-[12px]">
              {busy === "profile" ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              Analyze
            </Button>
          </form>
          <div className="mt-3 min-h-5">
            {busy === "profile" ? (
              <Status>Reading the site and writing a profile…</Status>
            ) : errorFor("profile") ? (
              <ErrorLine message={errorFor("profile")} />
            ) : (
              <span className="flex items-center gap-1.5 text-[12px] text-tertiary-foreground">
                <Shortcut keys="mod+enter" /> runs the next step
                <span className="mx-1.5">·</span>
                <Shortcut keys="mod+k" /> all shortcuts
              </span>
            )}
          </div>
        </div>

        {profile && (
          <Section
            step={1}
            title="Company profile"
            hint="Edit anything that's off. Every later step uses this."
            action={
              <Button size="sm" onClick={findCategories} disabled={busy !== null} className="h-7 rounded-md text-[12px]">
                <Sparkles /> {categories.length ? "Regenerate categories" : "Suggest partner categories"}
                {!categories.length && <Shortcut keys="mod+enter" className="ml-1 [&_kbd]:border-white/25 [&_kbd]:text-white/80" />}
              </Button>
            }
          >
            <div className="grid gap-x-5 gap-y-4 p-4 md:grid-cols-2">
              <div>
                <FieldLabel>Company</FieldLabel>
                <Input className={field} value={profile.company_name} onChange={(e) => updateProfile("company_name", e.target.value)} />
              </div>
              <div>
                <FieldLabel>Geography</FieldLabel>
                <Input className={field} value={profile.geography} onChange={(e) => updateProfile("geography", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <FieldLabel>One-liner</FieldLabel>
                <Input className={field} value={profile.one_liner} onChange={(e) => updateProfile("one_liner", e.target.value)} />
              </div>
              <div>
                <FieldLabel>What they sell</FieldLabel>
                <Textarea className={cn(field, "leading-[1.6]")} value={profile.product} onChange={(e) => updateProfile("product", e.target.value)} />
              </div>
              <div>
                <FieldLabel>Who buys it</FieldLabel>
                <Textarea className={cn(field, "leading-[1.6]")} value={profile.customers} onChange={(e) => updateProfile("customers", e.target.value)} />
              </div>
              <div>
                <FieldLabel>Value proposition</FieldLabel>
                <Textarea className={cn(field, "leading-[1.6]")} value={profile.value_prop} onChange={(e) => updateProfile("value_prop", e.target.value)} />
              </div>
              <div>
                <FieldLabel>What they lack (one per line)</FieldLabel>
                <Textarea
                  className={cn(field, "leading-[1.6]")}
                  value={profile.gaps.join("\n")}
                  onChange={(e) => updateProfile("gaps", e.target.value.split("\n"))}
                />
              </div>
            </div>
            {(busy === "categories" || errorFor("categories")) && (
              <div className="border-t border-border px-4 py-3">
                {busy === "categories" ? (
                  <Status>Working out who already has {profile.company_name}&apos;s customers…</Status>
                ) : (
                  <ErrorLine message={errorFor("categories")} />
                )}
              </div>
            )}
          </Section>
        )}

        {profile && categories.length > 0 && (
          <Section
            step={2}
            title="Partner categories"
            hint="Remove, rename or tweak the search queries before searching."
            action={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  className="h-7 rounded-md text-[12px]"
                  onClick={() =>
                    setCategories((cs) => [
                      ...cs,
                      { name: "New category", rationale: "", contact_role: "Head of Partnerships", queries: [""] },
                    ])
                  }
                >
                  <Plus /> Add category
                </Button>
                <Button size="sm" onClick={findPartners} disabled={busy !== null} className="h-7 rounded-md text-[12px]">
                  <Search /> {partners.length ? "Search again" : "Find partners"}
                  {!partners.length && <Shortcut keys="mod+enter" className="ml-1 [&_kbd]:border-white/25 [&_kbd]:text-white/80" />}
                </Button>
              </>
            }
          >
            <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
              {categories.map((c, i) => (
                <div key={i} className="group flex flex-col rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <LabelDot color={colorOf(c.name)} />
                    <input
                      value={c.name}
                      onChange={(e) => updateCategory(i, { name: e.target.value })}
                      className="min-w-0 flex-1 rounded bg-transparent text-[13px] font-medium text-foreground outline-none"
                    />
                    <button
                      onClick={() => setCategories((cs) => cs.filter((_, j) => j !== i))}
                      className="grid size-5 place-items-center rounded text-tertiary-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground"
                      aria-label="Remove category"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  {c.rationale && <p className="mt-1.5 text-[12px] leading-[1.55] text-muted-foreground">{c.rationale}</p>}
                  <div className="mt-3">
                    <FieldLabel>Contact</FieldLabel>
                    <Input className={cn(field, "h-7")} value={c.contact_role} onChange={(e) => updateCategory(i, { contact_role: e.target.value })} />
                  </div>
                  <div className="mt-3">
                    <FieldLabel>Search queries (one per line)</FieldLabel>
                    <Textarea
                      className={cn(field, "min-h-14 leading-[1.55]")}
                      value={c.queries.join("\n")}
                      onChange={(e) => updateCategory(i, { queries: e.target.value.split("\n") })}
                    />
                  </div>
                </div>
              ))}
            </div>
            {(busy === "partners" || errorFor("partners")) && (
              <div className="border-t border-border px-4 py-3">
                {busy === "partners" ? (
                  <Status>
                    Searching the web, then checking and scoring real companies. Takes 30–90 seconds ·{" "}
                    <Elapsed since={busySince} />
                  </Status>
                ) : (
                  <ErrorLine message={errorFor("partners")} />
                )}
              </div>
            )}
          </Section>
        )}

        {partners.length > 0 && (
          <Section
            step={3}
            transitionName="partners"
            title={filter ? `${visible.length} of ${active.length} partners` : `${active.length} potential partners`}
            hint={filter ? undefined : "Click a row (or J/K and ↵) for an outreach draft, or a category to filter."}
            action={
              <>
                {filter && (
                  <button
                    onClick={() => applyFilter(null)}
                    className="inline-flex h-7 max-w-[360px] items-center gap-1.5 rounded-md border border-border bg-[#1e1f22] pr-1.5 pl-2.5 text-[12px] text-foreground hover:bg-[#25262a]"
                    title="Show all categories (Esc)"
                  >
                    <LabelDot color={colorOf(filter)} />
                    <span className="truncate">{filter}</span>
                    <X className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-md text-[12px]"
                  onClick={findMore}
                  disabled={busy !== null}
                  title={filter ? `Search deeper for more ${filter}` : "Search deeper across every category"}
                >
                  {busy === "more" ? <Loader2 className="animate-spin" /> : <Plus />}
                  {busy === "more" ? "Finding more…" : "Find more"}
                  <Shortcut keys="f" className="ml-0.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-7 rounded-md text-[12px]" onClick={() => downloadCsv(profile, active)}>
                  <Download /> Export CSV
                  <Shortcut keys="shift+e" className="ml-0.5" />
                </Button>
              </>
            }
          >
            {busy === "more" && (
              <div className="border-b border-border px-4 py-2.5">
                <Status>
                  Searching deeper {filter ? `for ${filter}` : "across every category"}, skipping the {partners.length}{" "}
                  companies already listed · <Elapsed since={busySince} />
                </Status>
              </div>
            )}
            {(errorFor("email") || errorFor("more")) && (
              <div className="border-b border-border px-4 py-2.5">
                <ErrorLine message={errorFor("email") ?? errorFor("more")} />
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-tertiary-foreground">
                    <th className="h-9 w-[64px] pl-4 font-medium">Fit</th>
                    <th className="w-[200px] font-medium">Company</th>
                    <th className="w-[220px] font-medium">Category</th>
                    <th className="font-medium">Why they&apos;d care</th>
                    <th className="w-[170px] pr-2 font-medium">Contact</th>
                    <th className="w-10 pr-3" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => {
                    const open = openId === p.id;
                    const state = drafting === p.id ? "drafting" : p.email ? "done" : "none";
                    return (
                      <Fragment key={p.id}>
                        <tr
                          onClick={() => toggleRow(p)}
                          data-row-id={p.id}
                          style={{ viewTransitionName: `row-${p.id}` }}
                          className={cn(
                            "group scroll-mt-14 scroll-mb-4 cursor-pointer border-t border-border/70 align-top transition-colors hover:bg-row-hover",
                            (open || selectedId === p.id) && "bg-row-selected hover:bg-row-selected",
                            selectedId === p.id && "shadow-[inset_2px_0_0_var(--color-primary)]",
                          )}
                        >
                          <td className="py-3 pl-4">
                            <span className="flex items-center gap-1.5">
                              <ScoreBars score={p.fit_score} />
                              <span className="text-[12px] text-muted-foreground tabular-nums">{p.fit_score}</span>
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              <DraftStatus state={state} />
                              <span className="font-medium text-foreground">{p.name}</span>
                            </div>
                            <a
                              href={p.website ?? p.source_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={p.source_title}
                              className="mt-0.5 ml-[22px] block max-w-[170px] truncate text-[12px] text-tertiary-foreground hover:text-muted-foreground"
                            >
                              {p.website ? domain(p.website) : "source ↗"}
                            </a>
                          </td>
                          <td className="py-3 pr-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                applyFilter(filter === p.category ? null : p.category);
                              }}
                              title={
                                filter === p.category
                                  ? "Show all categories (0)"
                                  : `Show only this category (${filterOrder.indexOf(p.category) + 1})`
                              }
                              className="cursor-default rounded-xl text-left transition-colors hover:[&>span]:border-[#3b3e45] hover:[&>span]:text-foreground"
                            >
                              <Label name={p.category} color={colorOf(p.category)} />
                            </button>
                          </td>
                          <td className="py-3 pr-4 leading-[1.55] text-[#d0d6e0]">{p.why}</td>
                          <td className="py-3 pr-2">
                            <div className="text-muted-foreground">{p.contact_role}</div>
                            <a
                              href={linkedinSearchUrl(p)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Search LinkedIn for ${p.contact_role} at ${p.name}`}
                              className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-tertiary-foreground hover:text-muted-foreground"
                            >
                              <UserSearch className="size-3" /> Find on LinkedIn
                            </a>
                          </td>
                          <td className="py-2.5 pr-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRejected(p, true);
                              }}
                              title="Not a fit (X): hide it, leave it out of exports, skip it in future searches"
                              aria-label={`Mark ${p.name} as not a fit`}
                              className="grid size-7 place-items-center rounded-md text-tertiary-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                            >
                              <ThumbsDown className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-row-selected" style={{ viewTransitionName: `email-${p.id}` }}>
                            <td colSpan={6} className="px-4 pb-4">
                              <div className="rounded-lg border border-border bg-background">
                                <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-[12px]">
                                  <span className="text-tertiary-foreground">Found in</span>
                                  <a
                                    href={p.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-foreground"
                                  >
                                    <Link2 className="size-3.5 shrink-0" />
                                    <span className="truncate">{p.source_title || domain(p.source_url)}</span>
                                  </a>
                                  <div className="ml-auto flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setRejected(p, true)}
                                      className="h-7 rounded-md text-[12px] text-muted-foreground"
                                    >
                                      <ThumbsDown /> Not a fit <Shortcut keys="x" className="ml-0.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => generateEmail(p)}
                                      disabled={drafting === p.id}
                                      className="h-7 rounded-md text-[12px] text-muted-foreground"
                                    >
                                      <RefreshCw className={cn(drafting === p.id && "animate-spin")} />
                                      {p.email ? "Regenerate" : "Draft email"}
                                      <Shortcut keys={p.email ? "r" : "e"} className="ml-0.5" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => copyEmail(p)}
                                      disabled={!p.email || drafting === p.id}
                                      className="h-7 rounded-md text-[12px]"
                                    >
                                      <Copy /> Copy
                                      <Shortcut keys="c" className="ml-1 [&_kbd]:border-white/25 [&_kbd]:text-white/80" />
                                    </Button>
                                  </div>
                                </div>
                                {drafting === p.id || !p.email ? (
                                  <div className="flex flex-col gap-2.5 p-4">
                                    {drafting === p.id ? (
                                      <>
                                        <Status>Drafting an email to {p.name}…</Status>
                                        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-[#222327]" />
                                        <div className="h-3 w-full animate-pulse rounded bg-[#1b1c1f]" />
                                        <div className="h-3 w-11/12 animate-pulse rounded bg-[#1b1c1f]" />
                                        <div className="h-3 w-3/4 animate-pulse rounded bg-[#1b1c1f]" />
                                      </>
                                    ) : (
                                      <p className="text-[13px] text-muted-foreground">No draft yet.</p>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <input
                                      value={p.email.subject}
                                      onChange={(e) => updateEmail(p.id, { subject: e.target.value })}
                                      className="h-10 w-full border-b border-border bg-transparent px-4 text-[13px] font-medium text-foreground outline-none"
                                    />
                                    <textarea
                                      value={p.email.body}
                                      onChange={(e) => updateEmail(p.id, { body: e.target.value })}
                                      className="field-sizing-content min-h-[200px] w-full resize-none bg-transparent px-4 py-3 text-[13px] leading-[1.65] text-[#d0d6e0] outline-none"
                                    />
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rejected.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-3 text-[12px]">
                <span className="mr-1 text-tertiary-foreground">Not a fit ({rejected.length})</span>
                {rejected.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setRejected(p, false)}
                    title={`Restore ${p.name}`}
                    className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border px-2 text-muted-foreground line-through decoration-tertiary-foreground hover:text-foreground hover:no-underline"
                  >
                    {p.name}
                    <Undo2 className="size-3" />
                  </button>
                ))}
              </div>
            )}
            {searchNote && (
              <p className="border-t border-border px-4 py-3 text-[12px] text-tertiary-foreground">{searchNote}</p>
            )}
          </Section>
        )}
      </main>
      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
