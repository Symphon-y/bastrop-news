export interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly url: string | null;
  readonly location: string | null;
  readonly start: Date;
  /** Exclusive, as Google Calendar reports it. */
  readonly end: Date;
  readonly allDay: boolean;
  /**
   * Set on routine listings the digest counts instead of listing, e.g. "worship". The
   * Apps Script sync writes it as a shared extended property.
   */
  readonly digestGroup?: string;
}
