import type { LocalDay } from '../application/localDay.js';
import type { DigestFormatter, FormattedTextPost } from '../application/ports.js';
import type { CalendarEvent } from '../domain/calendarEvent.js';
import { REDDIT_TITLE_MAX_LENGTH } from './passthroughFormatter.js';

export const REDDIT_TEXT_MAX_LENGTH = 40_000;
const SOURCE_SITE_URL = 'https://bastropcountycalendar.com';

/** Characters that change meaning in Reddit markdown. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_~^[\]()>|#]/g, '\\$&');
}

export class DailyDigestFormatter implements DigestFormatter {
  constructor(
    private readonly timeZone: string,
    /** Link to the public Google Calendar, shown in the footer when set. */
    private readonly calendarUrl: string | null = null,
  ) {}

  format(day: LocalDay, events: readonly CalendarEvent[]): FormattedTextPost {
    const dateLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timeZone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(day.start);
    const title = `Happening today in Bastrop County: ${dateLabel}`.slice(0, REDDIT_TITLE_MAX_LENGTH);

    // Multi-day events read as "ongoing" -- their start time is often weeks ago.
    const isOngoing = (event: CalendarEvent): boolean =>
      event.allDay || event.start < day.start || event.end > day.end;
    const ongoing = events.filter(isOngoing);
    const timed = events
      .filter((event) => !isOngoing(event))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const sections: { heading: string; lines: string[] }[] = [];
    if (ongoing.length > 0) {
      sections.push({ heading: 'All day / ongoing', lines: ongoing.map((e) => this.line(e, null)) });
    }
    if (timed.length > 0) {
      sections.push({ heading: 'Today', lines: timed.map((e) => this.line(e, this.time(e.start))) });
    }

    const footer = this.footer();
    const body = this.assemble(sections, footer, events.length);
    return { title, body };
  }

  private time(instant: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: this.timeZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(instant);
  }

  private line(event: CalendarEvent, time: string | null): string {
    const title = escapeMarkdown(event.title);
    const linked = event.url ? `[${title}](${event.url})` : title;
    const venue = event.location ? ` · ${escapeMarkdown(event.location)}` : '';
    return `* ${time ? `**${time}**: ` : ''}${linked}${venue}`;
  }

  private footer(): string {
    const calendar = this.calendarUrl ? ` · [Subscribe to the calendar](${this.calendarUrl})` : '';
    return `---\n\n*Events from [Bastrop County Calendar](${SOURCE_SITE_URL})${calendar}*`;
  }

  /** Stops adding lines before the body would exceed Reddit's self-post limit. */
  private assemble(
    sections: { heading: string; lines: string[] }[],
    footer: string,
    total: number,
  ): string {
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
