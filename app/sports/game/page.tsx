"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import PaywallGuard from "../../components/PaywallGuard";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import type { GameDetail, Person, TeamSide, FieldEntry, Bout } from "../../lib/sportsDetail";

// One game, in as much detail as a free source carries.
//
// The /sports page listed games, predicted a winner and stopped there — a card
// had a Follow button and no way into the game. This is where a tap on one
// lands.
//
// A page like this is mostly absences, and the whole design question is how to
// show them. Lineups are published an hour or two before kickoff; a dome has no
// weather; most leagues here carry no betting line at all. So every section
// below says which of three things is true — here it is, it is not out yet, or
// we could not read it — because a reader who cannot tell "no lineup yet" from
// "we are broken" has been told nothing.

const card = "rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)]";
const label = "text-[12px] uppercase tracking-[0.08em] text-[var(--mx-text-3)]";

type Payload =
  | { ok: true; detail: GameDetail; updatedAt: string }
  | { ok: false; reason: string; hint?: string; detail?: string };

type State =
  | { kind: "loading" }
  | { kind: "ready"; detail: GameDetail }
  | { kind: "error"; message: string; retryable: boolean };

/** A section with nothing in it, said in the words that fit the reason. */
function Absent({ children }: { children: React.ReactNode }) {
  return <p className="text-[13.5px] leading-relaxed text-[var(--mx-text-3)]">{children}</p>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${card} p-5`}>
      <h2 className={label}>{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A player's photo, or their initials when ESPN has no headshot for them. */
function Face({ p, size = 44 }: { p: Person; size?: number }) {
  const initials = p.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  if (!p.headshot) {
    return (
      <div
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full border border-[var(--mx-line)] bg-[var(--mx-raised)] grid place-items-center text-[12px] text-[var(--mx-text-3)]"
      >
        {initials}
      </div>
    );
  }
  return (
    <Image
      src={p.headshot}
      alt=""
      width={size}
      height={size}
      // Plenty of these 404 or are missing for fringe players. An alt of "" and
      // a neutral background mean a missing photo looks like a blank circle
      // rather than a broken-image glyph beside someone's name.
      className="shrink-0 rounded-full border border-[var(--mx-line)] bg-[var(--mx-raised)] object-cover"
      unoptimized
    />
  );
}

function Crest({ t, size = 28 }: { t: TeamSide; size?: number }) {
  if (!t.logo) return null;
  return <Image src={t.logo} alt="" width={size} height={size} className="shrink-0 object-contain" unoptimized />;
}

function Lineup({ t, unreadable }: { t: TeamSide; unreadable: boolean }) {
  if (unreadable) {
    return (
      <Absent>
        A lineup was published for {t.name} and we couldn’t read it. That’s a fault on our
        side — not a team that hasn’t named one.
      </Absent>
    );
  }
  if (!t.lineup) {
    return (
      <div className="space-y-3">
        <Absent>
          No line-up published for {t.name} yet. Soccer names an eleven about an hour before
          kickoff and baseball names a probable pitcher earlier still; the NBA, NFL and NHL
          publish no line-up here at all before the game, and players appear once it is under way.
        </Absent>
        {/* Leaders exist well ahead of a game, so there is something true to
            say about who decides it even with no line-up out. */}
        {t.leaders && (
          <ul className="space-y-2 pt-1">
            {t.leaders.map((l, i) => (
              <li key={`${l.name}-${i}`} className="flex items-center gap-3">
                <Face p={{ id: null, name: l.name, position: null, jersey: null, headshot: l.headshot, starter: false }} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] truncate">{l.name}</span>
                  <span className="block text-[12px] text-[var(--mx-text-3)]">{l.category}</span>
                </span>
                <span className="shrink-0 text-[13.5px] tabular-nums">{l.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  const starters = t.lineup.filter(p => p.starter);
  const rest = t.lineup.filter(p => !p.starter);
  return (
    <div className="space-y-4">
      {t.formation && <p className="text-[13px] text-[var(--mx-text-2)]">Formation {t.formation}</p>}
      {t.lineupKind === "appeared" && (
        <p className="text-[12.5px] text-[var(--mx-text-3)]">
          Who played — taken from the box score, so it is a record of appearances rather than a
          named starting line-up.
        </p>
      )}
      {starters.length > 0 && (
        <ul className="space-y-2">
          {starters.map(p => (
            <li key={`${p.id ?? p.name}`} className="flex items-center gap-3">
              <Face p={p} />
              <span className="min-w-0">
                <span className="block text-[14.5px] truncate">{p.name}</span>
                <span className="block text-[12.5px] text-[var(--mx-text-3)]">
                  {[p.position, p.jersey ? `#${p.jersey}` : null].filter(Boolean).join(" · ") || "Starting"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-[12.5px] text-[var(--mx-text-3)] hover:text-[var(--mx-text-2)]">
            Rest of the squad ({rest.length})
            <span aria-hidden="true" className="ml-1.5 inline-block transition-transform group-open:rotate-45">+</span>
          </summary>
          <ul className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-2">
            {rest.map(p => (
              <li key={`${p.id ?? p.name}`} className="flex items-center gap-2.5">
                <Face p={p} size={30} />
                <span className="min-w-0">
                  <span className="block text-[13.5px] truncate">{p.name}</span>
                  {p.position && <span className="block text-[12px] text-[var(--mx-text-3)]">{p.position}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {starters.length === 0 && rest.length > 0 && (
        <Absent>
          Nobody is flagged as starting yet — this is the squad, not the eleven.
        </Absent>
      )}
    </div>
  );
}

function FormRow({ form }: { form: string[] }) {
  return (
    <span className="inline-flex gap-1" aria-label={`Recent results, most recent first: ${form.join(", ")}`}>
      {form.map((r, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="h-5 w-5 rounded-[5px] grid place-items-center text-[11px] border"
          style={{
            borderColor: r === "W" ? "var(--mx-up)" : r === "L" ? "var(--mx-down)" : "var(--mx-line)",
            color: r === "W" ? "var(--mx-up)" : r === "L" ? "var(--mx-down)" : "var(--mx-text-3)",
          }}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function TeamHeading({ t }: { t: TeamSide }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Crest t={t} />
      <span className="min-w-0">
        <span className="block text-[16px] truncate">{t.name}</span>
        <span className="block text-[12.5px] text-[var(--mx-text-3)]">
          {t.homeAway === "home" ? "Home" : "Away"}
          {t.record ? ` · ${t.record}` : ""}
        </span>
      </span>
      {t.score !== null && <span className="ml-auto text-[22px] tabular-nums">{t.score}</span>}
    </div>
  );
}

/** A leaderboard, a grid or a draw — a field rather than two sides. */
function Field({ entries }: { entries: FieldEntry[] | null }) {
  if (!entries) {
    return <Absent>No field published yet. Entry lists often appear closer to the start.</Absent>;
  }
  return (
    <ol className="divide-y divide-[var(--mx-line)]">
      {entries.map((e, i) => (
        <li key={`${e.name}-${i}`} className="flex items-center gap-3 py-2.5">
          <span className="w-9 shrink-0 text-[13px] tabular-nums text-[var(--mx-text-3)]">
            {e.position ?? i + 1}
          </span>
          <Face p={{ id: null, name: e.name, position: null, jersey: null, headshot: e.headshot, starter: false }} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] truncate">{e.name}</span>
            {e.country && <span className="block text-[12px] text-[var(--mx-text-3)]">{e.country}</span>}
          </span>
          {e.detail && <span className="shrink-0 text-[13.5px] tabular-nums">{e.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

/** A fight card: several bouts under one event. */
function Card({ bouts }: { bouts: Bout[] | null }) {
  if (!bouts) {
    return <Absent>No bouts published yet. Cards are often confirmed close to the night.</Absent>;
  }
  return (
    <ul className="space-y-3">
      {bouts.map((b, i) => (
        <li key={i} className={`${card} p-4`}>
          {(b.name || b.status) && (
            <p className="text-[12px] text-[var(--mx-text-3)]">{[b.name, b.status].filter(Boolean).join(" · ")}</p>
          )}
          <div className="mt-2 space-y-2">
            {b.fighters.map((f, j) => (
              <div key={j} className="flex items-center gap-3">
                <Face p={{ id: null, name: f.name, position: null, jersey: null, headshot: f.headshot, starter: false }} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] truncate">{f.name}</span>
                  {f.record && <span className="block text-[12px] text-[var(--mx-text-3)]">{f.record}</span>}
                </span>
                {f.winner && <span className="shrink-0 text-[12px]" style={{ color: "var(--mx-up)" }}>Won</span>}
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Said on every shape of this page, because it is true of all of them. */
function Footer() {
  return (
    <p className="text-[12.5px] leading-relaxed text-[var(--mx-text-3)] max-w-[72ch]">
      Schedules, lineups, fields, injuries and any line shown come from ESPN’s public data and
      can be incomplete or out of date — a lineup especially, which changes up to the start. For
      learning only, and not a recommendation to bet on anything.
    </p>
  );
}

/** The parts every shape of event shares. */
function SharedSections({ d }: { d: GameDetail }) {
  return (
    <>
      <Section title="Where it’s played">
        {d.venue ? (
          <div className="space-y-1.5">
            <p className="text-[16px]">{d.venue.name}</p>
            <p className="text-[13.5px] text-[var(--mx-text-2)]">
              {[d.venue.city, d.venue.state, d.venue.country].filter(Boolean).join(", ") || "Location not given"}
            </p>
            <p className="text-[13px] text-[var(--mx-text-3)] tabular-nums">
              {[
                d.venue.capacity !== null ? `Holds ${d.venue.capacity.toLocaleString("en-US")}` : null,
                d.venue.indoor === null ? null : d.venue.indoor ? "Indoor" : "Open air",
                d.attendance !== null ? `${d.attendance.toLocaleString("en-US")} attended` : null,
              ].filter(Boolean).join(" · ") || null}
            </p>
          </div>
        ) : (
          <Absent>No venue given for this event.</Absent>
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-3">
        <Section title="Where to watch">
          {d.broadcasts ? <p className="text-[14px]">{d.broadcasts.join(", ")}</p> : <Absent>No broadcaster listed.</Absent>}
        </Section>
        <Section title="Conditions">
          {d.weather ? (
            <p className="text-[14px] tabular-nums">
              {[
                d.weather.summary,
                d.weather.temperatureF !== null ? `${d.weather.temperatureF}°F` : null,
                d.weather.precipitationPct !== null ? `${d.weather.precipitationPct}% chance of rain` : null,
              ].filter(Boolean).join(" · ")}
            </p>
          ) : (
            <Absent>{d.venue?.indoor ? "Indoors — weather doesn’t apply." : "No forecast for this event."}</Absent>
          )}
        </Section>
      </div>
    </>
  );
}

function Header({ d, title }: { d: GameDetail; title: string }) {
  const when = d.start
    ? new Date(d.start).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <>
      <header>
        <Link href="/sports" className="text-[13px] text-[var(--mx-text-3)] underline hover:text-[var(--mx-text-2)]">
          ← All games
        </Link>
        <h1 className="mt-3 text-[26px] lg:text-[34px] leading-[1.1] tracking-[-0.02em]" style={{ fontWeight: 450 }}>
          {title}
        </h1>
        <p className="mt-2 text-[14px] text-[var(--mx-text-2)]">
          {[d.leagueLabel, d.statusDetail ?? when].filter(Boolean).join(" · ")}
        </p>
        {d.notes && d.notes.length > 0 && (
          <p className="mt-1 text-[13px] text-[var(--mx-text-3)]">{d.notes.join(" · ")}</p>
        )}
      </header>

      {/* A misparse is a fault on our side and is said so at the top, rather
          than leaving a reader to work out why a section looks thin. */}
      {d.unreadable.length > 0 && (
        <div className={`${card} p-4`}>
          <p className="text-[13.5px] text-[var(--mx-text-2)]">
            We couldn’t read {d.unreadable.join(", ")} for this event. The source answered; we
            failed to understand it. Everything else on this page is unaffected.
          </p>
        </div>
      )}
    </>
  );
}

function Detail({ d }: { d: GameDetail }) {
  // A field or a card is not a matchup, and the union means the compiler will
  // not let the matchup sections read `home` off one.
  if (d.kind === "field") {
    return (
      <div className="space-y-6">
        <Header d={d} title={d.name ?? "Event"} />
        <Section title="The field">
          <Field entries={d.field} />
        </Section>
        <SharedSections d={d} />
        <Footer />
      </div>
    );
  }

  if (d.kind === "card") {
    return (
      <div className="space-y-6">
        <Header d={d} title={d.name ?? "Fight card"} />
        <Section title="The card">
          <Card bouts={d.bouts} />
        </Section>
        <SharedSections d={d} />
        <Footer />
      </div>
    );
  }

  const sides: TeamSide[] = [d.away, d.home];

  return (
    <div className="space-y-6">
      <Header d={d} title={`${d.away.name} at ${d.home.name}`} />

      <section className={`${card} p-5 space-y-4`}>
        {sides.map(t => <TeamHeading key={t.homeAway} t={t} />)}
      </section>

      <Section title={
        d.home.lineupKind === "appeared" || d.away.lineupKind === "appeared" ? "Who played"
        : d.home.lineup || d.away.lineup ? "Who starts"
        : "Who to watch"
      }>
        <div className="grid lg:grid-cols-2 gap-6">
          {sides.map(t => (
            <div key={t.homeAway}>
              <p className="text-[14px] mb-3 flex items-center gap-2"><Crest t={t} size={20} />{t.name}</p>
              <Lineup t={t} unreadable={d.unreadable.includes(`${t.homeAway} lineup`)} />
            </div>
          ))}
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-3">
        <Section title="The line">
          {d.odds ? (
            <div className="space-y-1.5">
              {d.odds.spread && <p className="text-[16px]">{d.odds.spread}</p>}
              <p className="text-[13.5px] text-[var(--mx-text-2)] tabular-nums">
                {[
                  d.odds.overUnder !== null ? `Total ${d.odds.overUnder}` : null,
                  d.odds.homeMoneyline !== null ? `${d.home.abbreviation ?? "Home"} ${d.odds.homeMoneyline > 0 ? "+" : ""}${d.odds.homeMoneyline}` : null,
                  d.odds.awayMoneyline !== null ? `${d.away.abbreviation ?? "Away"} ${d.odds.awayMoneyline > 0 ? "+" : ""}${d.odds.awayMoneyline}` : null,
                ].filter(Boolean).join(" · ")}
              </p>
              {d.odds.provider && <p className="text-[12.5px] text-[var(--mx-text-3)]">Quoted by {d.odds.provider}</p>}
              <p className="text-[12.5px] text-[var(--mx-text-3)] pt-1">
                Shown because it is what the market thinks, not as something to act on.
              </p>
            </div>
          ) : (
            <Absent>No line quoted for this game.</Absent>
          )}
        </Section>

        <Section title="ESPN’s own forecast">
          {d.espnWinProbability ? (
            <div className="space-y-1.5">
              <p className="text-[15px] tabular-nums">
                {d.home.name} {d.espnWinProbability.homePct ?? "—"}% · {d.away.name} {d.espnWinProbability.awayPct ?? "—"}%
              </p>
              <p className="text-[12.5px] text-[var(--mx-text-3)]">
                ESPN’s model, not ours. Traxora’s own pick, and how often it has been right, are on
                the <Link href="/sports" className="underline">games list</Link>.
              </p>
            </div>
          ) : (
            <Absent>ESPN publishes no forecast for this game.</Absent>
          )}
        </Section>
      </div>

      <Section title="Who’s hurt">
        <div className="grid lg:grid-cols-2 gap-6">
          {sides.map(t => (
            <div key={t.homeAway}>
              <p className="text-[14px] mb-3">{t.name}</p>
              {t.injuries ? (
                <ul className="space-y-2">
                  {t.injuries.map((inj, i) => (
                    <li key={`${inj.name}-${i}`} className="flex items-center gap-3">
                      <Face p={{ id: null, name: inj.name, position: inj.position, jersey: null, headshot: inj.headshot, starter: false }} size={30} />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] truncate">{inj.name}</span>
                        <span className="block text-[12.5px] text-[var(--mx-text-3)]">
                          {[inj.status, inj.detail, inj.position].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Absent>No injury list published.</Absent>
              )}
            </div>
          ))}
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-3">
        <Section title="Recent form">
          <div className="space-y-3">
            {sides.map(t => (
              <div key={t.homeAway} className="flex items-center justify-between gap-3">
                <span className="text-[13.5px] truncate">{t.name}</span>
                {t.form ? <FormRow form={t.form} /> : <span className="text-[12.5px] text-[var(--mx-text-3)]">Not given</span>}
              </div>
            ))}
          </div>
        </Section>

      </div>

      {d.officials && (
        <Section title="Officials">
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {d.officials.map((o, i) => (
              <li key={`${o.name}-${i}`} className="text-[13.5px] flex justify-between gap-3">
                <span className="truncate">{o.name}</span>
                {o.position && <span className="text-[var(--mx-text-3)] shrink-0">{o.position}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <SharedSections d={d} />
      <Footer />
    </div>
  );
}

function GameContent() {
  const params = useSearchParams();
  const sport = params.get("sport") ?? "";
  const league = params.get("league") ?? "";
  const event = params.get("event") ?? "";

  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!sport || !league || !event) {
      setState({ kind: "error", message: "This link is missing the game it refers to.", retryable: false });
      return;
    }
    setState({ kind: "loading" });
    try {
      const q = new URLSearchParams({ sport, league, event });
      const res = await fetch(`/api/sports/game?${q.toString()}`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as Payload | null;
      if (body && body.ok === true) {
        setState({ kind: "ready", detail: body.detail });
        return;
      }
      const hint = body && "hint" in body && body.hint ? body.hint : `The source answered with ${res.status}.`;
      // Only a source that did not answer is worth another try; a game that
      // isn't there, or an answer we can't parse, will not change on a retry.
      const retryable = !!body && "reason" in body && body.reason === "unavailable";
      setState({ kind: "error", message: hint, retryable });
    } catch {
      setState({ kind: "error", message: "We couldn’t reach the game detail. Try again in a moment.", retryable: true });
    }
  }, [sport, league, event]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the load, and reloads when the game in the URL changes
    void load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <div className={`${card} p-5`} aria-busy="true">
        <div className="space-y-3 animate-pulse">
          <div className="h-7 w-72 rounded bg-[var(--mx-raised)]" />
          <div className="h-4 w-48 rounded bg-[var(--mx-raised)]" />
          <div className="h-24 w-full rounded bg-[var(--mx-raised)]" />
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="space-y-4">
        <Link href="/sports" className="text-[13px] text-[var(--mx-text-3)] underline hover:text-[var(--mx-text-2)]">
          ← All games
        </Link>
        <div className={`${card} p-5`}>
          <p className="text-[18px]">We couldn’t show this game.</p>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--mx-text-2)] max-w-[64ch]">{state.message}</p>
          {state.retryable && (
            <button type="button" onClick={() => void load()}
              className="mt-4 h-9 px-4 rounded-full border border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return <Detail d={state.detail} />;
}

export default function GamePage() {
  return (
    <PaywallGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="app-ambient min-w-0 flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
          <Topbar />
          <div className="max-w-5xl mx-auto w-full mt-3">
            <Suspense fallback={<div className={`${card} p-5`}><div className="h-7 w-72 rounded bg-[var(--mx-raised)] animate-pulse" /></div>}>
              <GameContent />
            </Suspense>
          </div>
        </main>
      </div>
    </PaywallGuard>
  );
}
