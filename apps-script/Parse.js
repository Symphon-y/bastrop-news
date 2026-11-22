/**
 * Pure functions: no Apps Script services except Utilities.computeDigest in
 * calendarIdFor, and canonicalCategory from Labels.js. Apps Script loads every file into one global scope, so these are
 * plain top-level declarations; tests/unit/appsScriptParse.test.ts evaluates this
 * file in a sandbox to reach them.
 */

var SOURCE_URL = 'https://bastropcountycalendar.com/api/events';
var EVENT_PAGE_BASE = 'https://bastropcountycalendar.com/events/';
/** The source's datetimes are naive local times in this zone. */
var SOURCE_TIME_ZONE = 'America/Chicago';
/** Marks calendar events this script owns, both in their id and their properties. */
var ID_PREFIX = 'bcc';
var DESCRIPTION_MAX_LENGTH = 4000;

var DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parses the source's loose datetime strings. Returns null for anything that is not
 * ISO-shaped (the source contains values like "January 1, 1863T00:00:00").
 */
function parseSourceDateTime(value) {
  if (typeof value !== 'string') return null;
  var match = DATE_TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  var hasTime = match[4] !== undefined;
  var hour = hasTime ? Number(match[4]) : 0;
  var minute = hasTime ? Number(match[5]) : 0;
  var second = match[6] !== undefined ? Number(match[6]) : 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return {
    date: match[1] + '-' + match[2] + '-' + match[3],
    hasTime: hasTime,
    hour: hour,
    minute: minute,
    second: second,
    offset: match[7] || null,
  };
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/** `YYYY-MM-DD` shifted by whole days, computed on the calendar, not in any zone. */
function addDays(date, days) {
  var parts = date.split('-');
  var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + days));
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

/**
 * Naive local wall-clock string. Calendar accepts a dateTime without an offset when a
 * timeZone is supplied alongside it, which avoids doing zone math here at all.
 */
function wallClock(parsed) {
  return parsed.date + 'T' + pad2(parsed.hour) + ':' + pad2(parsed.minute) + ':' + pad2(parsed.second);
}

function offsetString(offset) {
  if (offset === 'Z') return 'Z';
  return offset.length === 5 ? offset.slice(0, 3) + ':' + offset.slice(3) : offset;
}

/** Milliseconds for ordering two parsed values that share the same offset style. */
function comparableMs(parsed) {
  var parts = parsed.date.split('-');
  var ms = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), parsed.hour, parsed.minute, parsed.second);
  if (parsed.offset && parsed.offset !== 'Z') {
    var sign = parsed.offset[0] === '-' ? -1 : 1;
    var digits = parsed.offset.replace(/[^0-9]/g, '');
    ms -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) * 60000;
  }
  return ms;
}

function toCalendarDateTime(parsed) {
  if (parsed.offset) return { dateTime: wallClock(parsed) + offsetString(parsed.offset), timeZone: SOURCE_TIME_ZONE };
  return { dateTime: wallClock(parsed), timeZone: SOURCE_TIME_ZONE };
}

/** One hour after `parsed`, keeping its offset style. */
function plusOneHour(parsed) {
  var shifted = new Date(comparableMs(parsed) + 3600000);
  if (parsed.offset) return { dateTime: shifted.toISOString().replace('.000', ''), timeZone: SOURCE_TIME_ZONE };
  return {
    dateTime:
      shifted.getUTCFullYear() + '-' + pad2(shifted.getUTCMonth() + 1) + '-' + pad2(shifted.getUTCDate()) +
      'T' + pad2(shifted.getUTCHours()) + ':' + pad2(shifted.getUTCMinutes()) + ':' + pad2(shifted.getUTCSeconds()),
    timeZone: SOURCE_TIME_ZONE,
  };
}

/**
 * Normalises one source record, or returns null if it is inactive or unusable.
 *
 * The source's end values are inconsistent: a date with no time on many timed events,
 * null or empty on others. All-day ends are treated as the inclusive last day (Google
 * wants exclusive, hence +1 day). Timed events without a usable end get one hour.
 */
function parseSourceEvent(record) {
  if (!record || record.status !== 'active') return null;
  var sourceId = typeof record.id === 'string' ? record.id.trim() : '';
  var title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!sourceId || !title) return null;
  var start = parseSourceDateTime(record.start_datetime);
  if (!start) return null;
  var end = parseSourceDateTime(record.end_datetime);

  var allDay = Number(record.all_day) === 1 || !start.hasTime;
  var startTime;
  var endTime;
  if (allDay) {
    var lastDay = end && end.date >= start.date ? end.date : start.date;
    startTime = { date: start.date };
    endTime = { date: addDays(lastDay, 1) };
  } else {
    var endUsable =
      end && end.hasTime && Boolean(end.offset) === Boolean(start.offset) && comparableMs(end) > comparableMs(start);
    startTime = toCalendarDateTime(start);
    endTime = endUsable ? toCalendarDateTime(end) : plusOneHour(start);
  }

  var pageUrl = EVENT_PAGE_BASE + (record.slug || sourceId);
  var summaryText = String(record.short_summary || record.description || '').trim();
  var description = (summaryText ? summaryText + '\n\n' : '') + pageUrl;
  var location = String(record.location_address || record.location_name || '').trim();

  return {
    sourceId: sourceId,
    updatedAt: String(record.updated_at || ''),
    /** Canonical category slug (Labels.js), or null when the source's is unknown. */
    category: canonicalCategory(record.category),
    title: title,
    description: description.slice(0, DESCRIPTION_MAX_LENGTH),
    location: location || null,
    pageUrl: pageUrl,
    allDay: allDay,
    start: startTime,
    end: endTime,
  };
}

/** The local calendar date an event starts on, and the last date it covers. */
function eventDateSpan(normalized) {
  var startDate = (normalized.start.date || normalized.start.dateTime).slice(0, 10);
  var lastDate = normalized.end.date
    ? addDays(normalized.end.date, -1)
    : normalized.end.dateTime.slice(0, 10);
  return { startDate: startDate, lastDate: lastDate < startDate ? startDate : lastDate };
}

/** True if the event touches any day from `today` to `windowEnd`, inclusive. */
function inWindow(normalized, today, windowEnd) {
  var span = eventDateSpan(normalized);
  return span.lastDate >= today && span.startDate <= windowEnd;
}

function bytesToHex(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

/**
 * Deterministic event id, so a source event always maps to the same calendar entry.
 * Calendar ids allow only [a-v0-9]; hex digits and the prefix are within that.
 */
function calendarIdFor(sourceId) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sourceId, Utilities.Charset.UTF_8);
  return ID_PREFIX + bytesToHex(digest);
}

/**
 * Calendar API v3 event resource, minus the id (added on insert only). `labelId` is
 * written as eventLabelId when given; leaving it out leaves the label to the caller.
 */
function toCalendarResource(normalized, labelId) {
  var resource = {
    summary: normalized.title,
    description: normalized.description,
    start: normalized.start,
    end: normalized.end,
    source: { title: 'Bastrop County Calendar', url: normalized.pageUrl },
    extendedProperties: {
      private: {
        source: ID_PREFIX,
        sourceId: normalized.sourceId,
        sourceUpdatedAt: normalized.updatedAt,
        sourceCategory: normalized.category || '',
      },
    },
  };
  if (normalized.location) resource.location = normalized.location;
  if (labelId) resource.eventLabelId = labelId;
  return resource;
}
