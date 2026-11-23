import type { DailyDigest, DigestEntry } from '../application/digestSchedule.js';
import type { DigestFormatter, FormattedTextPost } from '../application/ports.js';
import { CITY_SOURCE, SOURCE_SITE_LINKS, SOURCE_SITE_URL } from '../eventsConfig.js';
import { REDDIT_TITLE_MAX_LENGTH } from './passthroughFormatter.js';

export const REDDIT_TEXT_MAX_LENGTH = 40_000;

/** Characters that change meaning in Reddit markdown. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_~^[\]()>|#]/g, '\\$&');
}

interface Section {
  heading: string;
  lines: string[];
}

/** Renders a DailyDigest as Reddit markdown. Which event goes where is decided upstream. */
export class DailyDigestFormatter implements DigestFormatter {
  constructor(
    private readonly timeZone: string,
    /** Link to the public Google Calendar, shown in the footer when set. */
    private readonly calendarUrl: string | null = null,
  ) {}

  format(digest: DailyDigest): FormattedTextPost {
    const longDate = this.date(digest.today.start, { weekday: 'long', month: 'long', day: 'numeric' });
    const title = `Happening today in Bastrop County: ${longDate}`.slice(0, REDDIT_TITLE_MAX_LENGTH);

    // In priority order: when the post is too long, the last sections are cut first.
    const sections: Section[] = [
      { heading: `Today: ${this.shortDay(digest.today.start)}`, lines: digest.todayEvents.map((e) => this.dayLine(e)) },
      { heading: 'Ongoing', lines: digest.ongoing.map((e) => this.line(e, null)) },
      {
        heading: `Tomorrow: ${this.shortDay(digest.tomorrow.start)}`,
        lines: digest.tomorrowEvents.map((e) => this.dayLine(e)),
      },
    ].filter((section) => section.lines.length > 0);

    const total = sections.reduce((sum, section) => sum + section.lines.length, 0);
    return { title, body: this.assemble(sections, this.footer(digest), total) };
  }

  private date(instant: Date, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat('en-US', { timeZone: this.timeZone, ...options }).format(instant);
  }

  /** "Monday, Nov 23" */
  private shortDay(instant: Date): string {
    return this.date(instant, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  private dayLine(entry: DigestEntry): string {
    const when = entry.event.allDay ? 'All day' : this.date(entry.event.start, { hour: 'numeric', minute: '2-digit' });
    return this.line(entry, when);
  }

  private line({ event, through }: DigestEntry, when: string | null): string {
    const title = escapeMarkdown(event.title);
    const parts = [event.url ? `[${title}](${event.url})` : title];
    if (event.location) parts.push(escapeMarkdown(event.location));
    if (through) parts.push(`through ${this.date(through, { weekday: 'short', month: 'short', day: 'numeric' })}`);
    return `* ${when ? `**${when}**: ` : ''}${parts.join(' · ')}`;
  }

  private footer(digest: DailyDigest): string {
    const links = SOURCE_SITE_LINKS.map((link) => `[${link.label}](${link.url})`).join(' · ');
    const calendar = this.calendarUrl ? ` · [Subscribe to the calendar](${this.calendarUrl})` : '';
    return (
      `---\n\n**Plan ahead:** ${links}\n\n` +
      `*Events from [Bastrop County Calendar](${SOURCE_SITE_URL})${this.cityCredit(digest)}${calendar}*`
    );
  }

  /** Credits the city calendar only on days its events are actually listed. */
  private cityCredit(digest: DailyDigest): string {
    const entries = [...digest.todayEvents, ...digest.ongoing, ...digest.tomorrowEvents];
    const listed = entries.some((entry) => entry.event.url?.startsWith(CITY_SOURCE.pageUrlPrefix));
    return listed ? ` and the [${CITY_SOURCE.name}](${CITY_SOURCE.url})` : '';
  }

  /** Stops adding lines before the body would exceed Reddit's self-post limit. */
  private assemble(sections: Section[], footer: string, total: number): string {
    // Room for the "...and N more" line and the footer, which are always appended.
    const budget = REDDIT_TEXT_MAX_LENGTH - footer.length - 200;
    const parts: string[] = [];
    let length = 0;
    let shown = 0;
    outer: for (const section of sections) {
      const heading = `### ${section.heading}\n`;
      if (length + heading.length > budget) break;
      parts.push(heading);
      length += heading.length;
      for (const line of section.lines) {
        if (length + line.length + 1 > budget) break outer;
        parts.push(`${line}\n`);
        length += line.length + 1;
        shown += 1;
      }
      parts.push('\n');
      length += 1;
    }
    if (shown < total) {
      parts.push(`\n…and ${total - shown} more on [Bastrop County Calendar](${SOURCE_SITE_URL}).\n\n`);
    }
    parts.push(footer);
    return parts.join('').replace(/\n{3,}/g, '\n\n');
  }
}
