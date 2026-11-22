import type { EventSource } from '../../src/server/application/ports.js';
import type { CalendarEvent } from '../../src/server/domain/calendarEvent.js';

export class FakeEventSource implements EventSource {
  readonly calls: { start: Date; end: Date }[] = [];

  constructor(private readonly events: CalendarEvent[]) {}

  async fetchEventsBetween(start: Date, end: Date): Promise<CalendarEvent[]> {
    this.calls.push({ start, end });
    return this.events.filter((event) => event.start < end && event.end > start);
  }
}
