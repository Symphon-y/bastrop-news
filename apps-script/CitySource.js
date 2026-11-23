/**
 * The City of Bastrop's Community Calendar (connect.cityofbastrop.org), hosted on the
 * BeWith platform. Its events are read from the JSON endpoint that the city's own
 * calendar widget uses. The endpoint is public and needs no login, but it is not
 * documented, so everything here is defensive and the sync treats a failure as "skip
 * the city this run", never as "the city's events are gone".
 *
 * Pure functions except fetchCityEvents; tests/unit/appsScriptCitySource.test.ts.
 */

var CITY_API = 'https://api.withapps.io/api/v2/organizations/56/communities/261/resources/published';
var CITY_PAGE_SIZE = 50;
/** About 120 events per 45 days today; the cap only guards against a runaway loop. */
var CITY_MAX_PAGES = 10;
/** Script property that turns the city source on ("on"); off by default. */
var CITY_SOURCE_PROPERTY = 'CITY_SOURCE_ENABLED';
/** Titles of this many words or fewer get the organizer appended ("TRIVIA" alone says little). */
var GENERIC_TITLE_MAX_WORDS = 2;

/** `fromSeconds`/`toSeconds` are unix times; events spanning the start are included. */
function cityPageUrl(fromSeconds, toSeconds, page) {
  var params = [
    ['filterBy[startsAt]', fromSeconds],
    ['filterBy[endsAt]', toSeconds],
    ['filterBy[onlyDated]', 'true'],
    ['filterBy[includeSpanning]', 'true'],
    // "regular" is an event; the other type ("checking") is a sign-up and stays out.
    ['filterBy[resourceType][0]', 'regular'],
    ['pageSize', CITY_PAGE_SIZE],
    ['page', page],
  ];
  return (
    CITY_API +
    '?' +
    params
      .map(function (pair) {
        return encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1]);
      })
      .join('&')
  );
}

/** Reads every page through `fetchPage(n)`, which returns the parsed JSON for page n. */
function collectCityPages(fetchPage) {
  var records = [];
  for (var page = 1; page <= CITY_MAX_PAGES; page++) {
    var json = fetchPage(page);
    var data = json && json.data;
    if (!data || !Array.isArray(data.records) || !data.pagination) {
      throw new Error('City source returned an unexpected shape on page ' + page);
    }
    records = records.concat(data.records);
    if (page >= Number(data.pagination.totalPages)) break;
  }
  return records;
}

var HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', '#39': "'", apos: "'" };

/**
 * The city's descriptions are HTML. Its `plainDescription` field is lowercased, so the
 * HTML is the better source of readable text.
 */
function htmlToText(html) {
  return String(html || '')
    .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#39|[a-z]+);/gi, function (whole, name) {
      var key = name.toLowerCase();
      return HTML_ENTITIES[key] !== undefined ? HTML_ENTITIES[key] : whole;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function expandGenericTitle(title, organizer) {
  var who = String(organizer || '').trim();
  var words = title.split(/\s+/).filter(Boolean).length;
  if (!who || words > GENERIC_TITLE_MAX_WORDS || CITY_MEETINGS_ORGANIZER.test(who)) return title;
  if (normalizeTitle(title).indexOf(normalizeTitle(who).split(' ')[0]) === 0) return title;
  return title + ' at ' + who;
}

/** The public event page, without the platform's tracking parameters. */
function cityPageLink(resourceUrl) {
  return String(resourceUrl || '').split('?')[0];
}

/** Normalises one city record into the shared event shape, or null if unusable. */
function parseCityRecord(record) {
  if (!record || record.isPrivateEvent === true || record.resourceId === undefined || record.resourceId === null) {
    return null;
  }
  var name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) return null;
  var organizer = String(record.leaderName || '').trim();
  // Local wall-clock times date an evening event on the right day; the UTC fields
  // would put a 7 PM event on the next day.
  var local = record.timezone === SOURCE_TIME_ZONE;
  var pageUrl = cityPageLink(record.resourceUrl);
  var text = htmlToText(record.description);
  var summary = [text, organizer ? 'Hosted by ' + organizer + '.' : ''].filter(Boolean).join('\n\n');
  return normalizeEvent({
    source: 'cob',
    sourceId: 'cob:' + record.resourceId,
    title: expandGenericTitle(name, organizer),
    start: local ? record.startsAt : record.startsAtUtc,
    end: local ? record.endsAt : record.endsAtUtc,
    allDay: record.isAllDay === true,
    summary: summary,
    location: record.locationText || record.location,
    pageUrl: pageUrl,
    updatedAt: record.updatedAt,
    category: cityCategory(name, organizer),
  });
}

/** Live fetch, used by Sync.js. Throws on any HTTP or shape problem. */
function fetchCityEvents(today, windowEnd) {
  var from = Utilities.parseDate(today + ' 00:00', SOURCE_TIME_ZONE, 'yyyy-MM-dd HH:mm');
  var to = Utilities.parseDate(addDays(windowEnd, 1) + ' 00:00', SOURCE_TIME_ZONE, 'yyyy-MM-dd HH:mm');
  var fromSeconds = Math.floor(from.getTime() / 1000);
  var toSeconds = Math.floor(to.getTime() / 1000) - 1;
  return collectCityPages(function (page) {
    var response = UrlFetchApp.fetch(cityPageUrl(fromSeconds, toSeconds, page), {
      muteHttpExceptions: true,
      headers: { Accept: 'application/json' },
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('City source page ' + page + ' failed: HTTP ' + response.getResponseCode());
    }
    return JSON.parse(response.getContentText());
  });
}
