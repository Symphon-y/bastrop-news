/**
 * Pure functions shared by every source: no Apps Script services except
 * Utilities.computeDigest in calendarIdFor. Apps Script loads every file into one global
 * scope, so these are plain top-level declarations; the tests evaluate the files in a
 * sandbox (tests/fakes/appsScriptSandbox.ts) to reach them.
 */

/** bastropcountycalendar.com's documented public API (see its /llms.txt). */
var COUNTY_API = 'https://bastropcountycalendar.com/api/public/events';
var EVENT_PAGE_BASE = 'https://bastropcountycalendar.com/events/';
/** Every source's naive local datetimes are in this zone, and so is the calendar. */
var SOURCE_TIME_ZONE = 'America/Chicago';
var DESCRIPTION_MAX_LENGTH = 4000;

/**
 * Every source this script syncs, keyed by the tag stored in each event's private
 * properties. The id prefix is how ownership is recognised: deleted events come back
 * without their properties. Prefixes must be base32hex ([a-v0-9]), and none may be a
 * prefix of another.
 */
var SOURCES = {
  bcc: { idPrefix: 'bcc', title: 'Bastrop County Calendar' },
  cob: { idPrefix: 'bcob', title: 'City of Bastrop Community Calendar' },
};

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
 * Builds the event shape every source produces, from loose date strings. Returns null
 * when the start is unusable.
 *
 * End values are inconsistent across sources: a date with no time on many timed events,
 * null or empty on others. All-day ends are treated as the inclusive last day (Google
 * wants exclusive, hence +1 day). Timed events without a usable end get one hour.
 */
function normalizeEvent(fields) {
  var start = parseSourceDateTime(fields.start);
  if (!start || !fields.sourceId || !fields.title) return null;
  var end = parseSourceDateTime(fields.end);

  var allDay = Boolean(fields.allDay) || !start.hasTime;
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

  var summaryText = String(fields.summary || '').trim();
  var description = (summaryText ? summaryText + '\n\n' : '') + fields.pageUrl;
  var location = String(fields.location || '').trim();
  return {
    source: fields.source,
    sourceId: fields.sourceId,
    updatedAt: String(fields.updatedAt || ''),
    /** Canonical category slug (Labels.js), or null when unknown. */
    category: fields.category || null,
    title: fields.title,
    description: description.slice(0, DESCRIPTION_MAX_LENGTH),
    location: location || null,
    pageUrl: fields.pageUrl,
    allDay: allDay,
    start: startTime,
    end: endTime,
  };
}

/** Normalises one bastropcountycalendar.com record, or null if inactive or unusable. */
function parseSourceEvent(record) {
  if (!record || record.status !== 'active') return null;
  var sourceId = typeof record.id === 'string' ? record.id.trim() : '';
  var title = typeof record.title === 'string' ? record.title.trim() : '';
  return normalizeEvent({
    source: 'bcc',
    sourceId: sourceId,
    title: title,
    start: record.start,
    end: record.end,
    allDay: record.allDay === true,
    summary: record.summary || record.description,
    location: record.address || record.venue,
    pageUrl: record.url || EVENT_PAGE_BASE + (record.slug || sourceId),
    updatedAt: record.updatedAt,
    category: canonicalCategory(record.category),
  });
}

/** `to` is inclusive, and events already running on `from` are included. */
function countyEventsUrl(today, windowEnd) {
  return COUNTY_API + '?from=' + today + '&to=' + windowEnd;
}

function countyRecords(json) {
  if (!json || !Array.isArray(json.events)) throw new Error('County source did not return {events: [...]}');
  return json.events;
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
 * Calendar ids allow only [a-v0-9]; hex digits and the prefixes are within that.
 */
function calendarIdFor(sourceId, sourceKey) {
  var prefix = SOURCES[sourceKey || 'bcc'].idPrefix;
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sourceId, Utilities.Charset.UTF_8);
  return prefix + bytesToHex(digest);
}

/** The source that owns a calendar event id, or null for events this script did not make. */
function sourceKeyForId(id) {
  var keys = Object.keys(SOURCES);
  for (var i = 0; i < keys.length; i++) {
    if (String(id).indexOf(SOURCES[keys[i]].idPrefix) === 0) return keys[i];
  }
  return null;
}

function normalizeTitle(title) {
  return String(title).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Drops repeats, keeping the first occurrence, so sources are listed in priority order.
 * Within a source only exact repeats (same title and start) go: two storytimes on one
 * day are two events. Across sources the same title on the same day is the same event.
 */
function dedupeEvents(events) {
  var exact = {};
  var sameDay = {};
  var kept = [];
  events.forEach(function (event) {
    var title = normalizeTitle(event.title);
    var startKey = event.start.date || event.start.dateTime;
    var dayKey = title + '|' + eventDateSpan(event).startDate;
    var exactKey = title + '|' + startKey;
    var firstSource = sameDay[dayKey];
    if (exact[exactKey] || (firstSource && firstSource !== event.source)) return;
    exact[exactKey] = true;
    if (!firstSource) sameDay[dayKey] = event.source;
    kept.push(event);
  });
  return { kept: kept, dropped: events.length - kept.length };
}

/**
 * True for an event this script made whose source was read this run and no longer
 * lists it. Events that have ended, or lie beyond the window, are never removed: the
 * source was not asked about them. `item` is a Calendar event resource; its start and
 * end have the same shape as a normalized event's.
 */
function isOrphan(item, fetchedSources, activeSourceIds, today, windowEnd) {
  if (!item || item.status === 'cancelled') return false;
  var key = sourceKeyForId(item.id);
  if (!key || !fetchedSources[key]) return false;
  var stored = item.extendedProperties && item.extendedProperties.private;
  if (!stored || stored.source !== key || activeSourceIds[stored.sourceId]) return false;
  if (!item.start || !item.end) return false;
  return inWindow(item, today, windowEnd);
}

/**
 * A start or end for events.patch. PATCH merges nested objects field by field, so
 * turning a timed event all-day (or back) must clear the other form explicitly, or
 * the event ends up with both `date` and `dateTime` and Calendar rejects it with
 * "Invalid start time".
 */
function patchTime(time) {
  if (time.date) return { date: time.date, dateTime: null, timeZone: null };
  return { date: null, dateTime: time.dateTime, timeZone: time.timeZone || null };
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
    source: { title: SOURCES[normalized.source].title, url: normalized.pageUrl },
    extendedProperties: {
      private: {
        source: normalized.source,
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
