export interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly url: string | null;
  readonly location: string | null;
  readonly start: Date;
  /** Exclusive, as Google Calendar reports it. */
  readonly end: Date;
  readonly allDay: boolean;
}
