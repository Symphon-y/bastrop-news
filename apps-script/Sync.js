/**
 * Copies bastropcountycalendar.com's events into a public Google Calendar, labelled by
 * category. Run daily at 5 AM Central by the trigger installTrigger() creates, ahead of
 * the Devvit app's 7 AM digest. Setup: README.md.
 */

var WINDOW_DAYS = 45;
/**
 * Writes stop once a run has used this much time, leaving margin under Apps Script's
 * 6-minute execution limit; anything left is written on the next run.
 */
var WRITE_BUDGET_MS = 4 * 60 * 1000;
/** Spaces writes out to stay under Calendar's per-user write rate. */
var WRITE_PAUSE_MS = 150;
/** Local hour (script time zone) the daily trigger runs in. Before the 7 AM digest. */
var SYNC_HOUR = 5;
/** Remembered suppressions are dropped after this long; by then the event has passed. */
var SUPPRESSION_MEMORY_DAYS = 90;
var SUPPRESSED_PROPERTY = 'SUPPRESSED_IDS';
var CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
/** Required on event writes for eventLabelId to be applied. */
var LABEL_QUERY = { eventLabelVersion: 1 };

function syncEvents() {
  var startedAt = Date.now();
  var properties = PropertiesService.getScriptProperties();
  var calendarId = properties.getProperty('CALENDAR_ID');
  if (!calendarId) throw new Error('Set the CALENDAR_ID script property (Project Settings > Script properties).');

  var response = UrlFetchApp.fetch(SOURCE_URL, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('Source fetch failed: HTTP ' + response.getResponseCode());
  }
  var records = JSON.parse(response.getContentText());
  if (!Array.isArray(records)) throw new Error('Source did not return a JSON array');

  var now = new Date();
  var today = Utilities.formatDate(now, SOURCE_TIME_ZONE, 'yyyy-MM-dd');
  var windowEnd = addDays(today, WINDOW_DAYS);

  var labels = ensureLabels(calendarId);
  var counts = {
    created: 0,
    updated: 0,
    deleted: 0,
    suppressed: 0,
    unchanged: 0,
    unparseable: 0,
    deferred: 0,
    labeled: 0,
    unlabeled: 0,
    labelsCreated: labels.created,
  };
  var unknownCategories = {};
  var activeSourceIds = {};
  var desired = {};
  records.forEach(function (record) {
    var normalized = parseSourceEvent(record);
    if (!normalized) {
      if (record && record.status === 'active') counts.unparseable++;
      return;
    }
    activeSourceIds[normalized.sourceId] = true;
    if (!inWindow(normalized, today, windowEnd)) return;
    desired[calendarIdFor(normalized.sourceId)] = normalized;
    if (normalized.category && labels.bySlug[normalized.category]) {
      counts.labeled++;
    } else {
      counts.unlabeled++;
      unknownCategories[String(record.category)] = true;
    }
  });

  var existing = listOwnedEvents(calendarId, now);
  var suppressed = loadSuppressed(properties, today);
  Object.keys(existing).forEach(function (id) {
    if (existing[id].status === 'cancelled') suppressed[id] = suppressed[id] || today;
  });

  var writes = 0;
  function canWrite() {
    if (Date.now() - startedAt > WRITE_BUDGET_MS) {
      counts.deferred++;
      return false;
    }
    writes++;
    if (writes > 1) Utilities.sleep(WRITE_PAUSE_MS);
    return true;
  }

  var eventsPath = 'calendars/' + encodeURIComponent(calendarId) + '/events';
  Object.keys(desired).forEach(function (id) {
    var normalized = desired[id];
    var current = existing[id];
    var labelId = (normalized.category && labels.bySlug[normalized.category]) || '';
    // A cancelled entry with our id means someone deleted it in Calendar; respect that.
    if (suppressed[id]) {
      counts.suppressed++;
      return;
    }
    if (!current) {
      if (!canWrite()) return;
      var resource = toCalendarResource(normalized, labelId);
      resource.id = id;
      var inserted = calendarRequest('post', eventsPath, LABEL_QUERY, resource);
      if (inserted.code === 409) {
        // The id exists but was not listed -- a deletion older than the list's reach.
        suppressed[id] = today;
        counts.suppressed++;
        return;
      }
      calendarOk(inserted, 'events.insert');
      counts.created++;
      return;
    }

    var stored = (current.extendedProperties && current.extendedProperties.private) || {};
    var sourceChanged = stored.sourceUpdatedAt !== normalized.updatedAt;
    // Events synced before labels existed have no sourceCategory, so this also backfills.
    var categoryChanged = stored.sourceCategory !== (normalized.category || '');
    if (!sourceChanged && !categoryChanged) {
      counts.unchanged++;
      return;
    }
    if (!canWrite()) return;
    // eventLabelId is always sent: omitting it on a labelled write clears the label.
    // Keeping the current one when only the details changed preserves a label a
    // moderator picked by hand.
    var keptLabel = categoryChanged ? labelId : current.eventLabelId || labelId;
    var patch = toCalendarResource(normalized, null);
    patch.eventLabelId = keptLabel;
    calendarOk(calendarRequest('patch', eventsPath + '/' + id, LABEL_QUERY, patch), 'events.patch');
    counts.updated++;
  });

  // Only events whose source record is gone or inactive are removed. Anything merely
  // outside the window is left alone, so past events stay on the calendar.
  Object.keys(existing).forEach(function (id) {
    var current = existing[id];
    if (current.status === 'cancelled') return;
    var stored = current.extendedProperties && current.extendedProperties.private;
    if (!stored || stored.source !== ID_PREFIX || activeSourceIds[stored.sourceId]) return;
    if (!canWrite()) return;
    var removed = calendarRequest('delete', eventsPath + '/' + id);
    if (removed.code !== 410) calendarOk(removed, 'events.delete');
    counts.deleted++;
  });

  saveSuppressed(properties, suppressed);
  var unknown = Object.keys(unknownCategories);
  if (unknown.length > 0) console.log('categories with no label: ' + unknown.join(', '));
  console.log('syncEvents ' + today + ': ' + JSON.stringify(counts));
  return counts;
}

/**
 * Calendar API v3 over UrlFetchApp rather than the Advanced Calendar service, whose
 * client may predate event labels and drop eventLabelVersion or labelProperties. The
 * manifest still lists that service: declaring it is what enables the Calendar API on
 * the script's default Cloud project, which these direct calls also run under.
 */
function calendarRequest(method, path, query, body) {
  var params = [];
  Object.keys(query || {}).forEach(function (key) {
    if (query[key] !== undefined && query[key] !== null) {
      params.push(encodeURIComponent(key) + '=' + encodeURIComponent(query[key]));
    }
  });
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
  };
  if (body !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  var url = CALENDAR_API + '/' + path + (params.length ? '?' + params.join('&') : '');
  var response = UrlFetchApp.fetch(url, options);
  var text = response.getContentText();
  return { code: response.getResponseCode(), json: text ? JSON.parse(text) : null };
}

function calendarOk(result, what) {
  if (result.code >= 200 && result.code < 300) return result.json;
  var message = result.json && result.json.error ? result.json.error.message : '';
  throw new Error(what + ' failed: HTTP ' + result.code + (message ? ' -- ' + message : ''));
}

/**
 * Maps every category to a label on the calendar, reusing the owner's labels where
 * one fits (Labels.js) and creating the rest in the site's colors. The full list is
 * written back because labelProperties is replaced, not merged.
 */
function ensureLabels(calendarId) {
  var path = 'calendars/' + encodeURIComponent(calendarId);
  var calendar = calendarOk(calendarRequest('get', path), 'calendars.get');
  var existing = (calendar.labelProperties && calendar.labelProperties.eventLabels) || [];
  var match = matchLabels(existing);
  match.notes.forEach(function (note) {
    console.log('label match: ' + note);
  });
  if (match.toCreate.length === 0) return { bySlug: match.bySlug, created: 0 };

  var created = match.toCreate.map(function (entry) {
    return { id: Utilities.getUuid(), name: entry.name, backgroundColor: entry.backgroundColor };
  });
  calendarOk(
    calendarRequest('patch', path, null, { labelProperties: { eventLabels: existing.concat(created) } }),
    'calendars.patch (labels)',
  );
  created.forEach(function (label, i) {
    match.bySlug[match.toCreate[i].slug] = label.id;
    console.log('created label "' + label.name + '" ' + label.backgroundColor + ' for ' + match.toCreate[i].slug);
  });
  return { bySlug: match.bySlug, created: created.length };
}

/**
 * Every event this script owns in the sync window, including cancelled ones.
 * Filtering by id prefix rather than privateExtendedProperty matters: deleted events
 * come back without their properties, and they are how mod deletions are detected.
 */
function listOwnedEvents(calendarId, now) {
  var owned = {};
  var pageToken;
  do {
    var page = calendarOk(
      calendarRequest('get', 'calendars/' + encodeURIComponent(calendarId) + '/events', {
        // A day back, so today's already-finished events are still seen as existing.
        timeMin: new Date(now.getTime() - 86400000).toISOString(),
        timeMax: new Date(now.getTime() + (WINDOW_DAYS + 2) * 86400000).toISOString(),
        showDeleted: true,
        singleEvents: true,
        maxResults: 2500,
        pageToken: pageToken,
      }),
      'events.list',
    );
    (page.items || []).forEach(function (item) {
      if (item.id && item.id.indexOf(ID_PREFIX) === 0) owned[item.id] = item;
    });
    pageToken = page.nextPageToken;
  } while (pageToken);
  return owned;
}

function loadSuppressed(properties, today) {
  var raw = properties.getProperty(SUPPRESSED_PROPERTY);
  var stored = raw ? JSON.parse(raw) : {};
  var cutoff = addDays(today, -SUPPRESSION_MEMORY_DAYS);
  var kept = {};
  Object.keys(stored).forEach(function (id) {
    if (stored[id] >= cutoff) kept[id] = stored[id];
  });
  return kept;
}

function saveSuppressed(properties, suppressed) {
  properties.setProperty(SUPPRESSED_PROPERTY, JSON.stringify(suppressed));
}

/**
 * Run once by hand. Replaces any existing syncEvents trigger with a daily one. One fetch
 * a day keeps the load on bastropcountycalendar.com minimal; Apps Script runs it at some
 * point within the SYNC_HOUR hour.
 */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncEvents') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncEvents')
    .timeBased()
    .everyDays(1)
    .atHour(SYNC_HOUR)
    .inTimezone(SOURCE_TIME_ZONE)
    .create();
}
