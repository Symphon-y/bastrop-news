/**
 * Category -> Google Calendar event label. Pure; loaded into the same global scope as
 * Parse.js and Sync.js, and into a sandbox by tests/unit/appsScriptParse.test.ts.
 */

/**
 * The site's 12 canonical categories (its `data-categories`), with the colors from its
 * stylesheet. `shortName` is the site's filter-chip name where it has one, which is
 * also the name used for a label this script creates.
 */
var CATEGORIES = [
  { slug: 'community', shortName: 'Community', siteLabel: 'Community', color: '#35512f' },
  { slug: 'arts-entertainment', shortName: 'Arts', siteLabel: 'Arts & Entertainment', color: '#7b2d8e' },
  { slug: 'music', shortName: 'Music', siteLabel: 'Music', color: '#b22234' },
  { slug: 'family-kids', shortName: 'Family', siteLabel: 'Family & Kids', color: '#e55b8a' },
  { slug: 'markets-shopping', shortName: 'Markets', siteLabel: 'Markets & Shopping', color: '#e8705a' },
  { slug: 'sports-outdoors', shortName: 'Outdoors', siteLabel: 'Sports & Outdoors', color: '#3b82c4' },
  { slug: 'education', shortName: 'Education', siteLabel: 'Education', color: '#2aaca8' },
  { slug: 'business-networking', shortName: 'Business', siteLabel: 'Business & Networking', color: '#1b3a5c' },
  { slug: 'government-civic', shortName: 'Government', siteLabel: 'Government & Civic', color: '#6b7b8d' },
  { slug: 'health-wellness', shortName: 'Health', siteLabel: 'Health & Wellness', color: '#5bc5a7' },
  { slug: 'food-drink', shortName: 'Food', siteLabel: 'Food & Drink', color: '#e87e2a' },
  { slug: 'faith', shortName: 'Faith', siteLabel: 'Faith & Worship', color: '#d4a017' },
];

/**
 * Older listings carry slugs outside the canonical set, and the site's own filters
 * miss them. `classes` is fitness and wellness (yoga, Zumba, tai chi).
 */
var CATEGORY_ALIASES = {
  classes: 'health-wellness',
  health: 'health-wellness',
  family: 'family-kids',
  kids: 'family-kids',
  arts: 'arts-entertainment',
  'arts-culture': 'arts-entertainment',
  sports: 'sports-outdoors',
  outdoors: 'sports-outdoors',
  government: 'government-civic',
  business: 'business-networking',
  markets: 'markets-shopping',
  food: 'food-drink',
  'festivals-fairs': 'community',
};

var MATCH_EXACT = 3;
var MATCH_CLOSE = 2;
var MATCH_TYPO = 1;

function canonicalCategory(raw) {
  if (typeof raw !== 'string') return null;
  var slug = raw.trim().toLowerCase();
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].slug === slug) return slug;
  }
  return CATEGORY_ALIASES[slug] || null;
}

/** "Arts & Entertainment" -> ["art", "entertainment"]. */
function normalizeLabelName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(function (word) {
      return word && word !== 'and';
    })
    .map(function (word) {
      return word.length > 3 && /[^s]s$/.test(word) ? word.slice(0, -1) : word;
    });
}

function editDistance(a, b) {
  var previous = [];
  for (var j = 0; j <= b.length; j++) previous.push(j);
  for (var i = 1; i <= a.length; i++) {
    var current = [i];
    for (var k = 1; k <= b.length; k++) {
      current.push(Math.min(previous[k] + 1, current[k - 1] + 1, previous[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)));
    }
    previous = current;
  }
  return previous[b.length];
}

function sameWords(a, b) {
  return a.length === b.length && a.every(function (word) { return b.indexOf(word) !== -1; });
}

/** How well an existing label's name fits a category; 0 means not at all. */
function labelScore(labelName, category) {
  var words = normalizeLabelName(labelName);
  if (words.length === 0) return 0;
  var shortWords = normalizeLabelName(category.shortName);
  var fullWords = normalizeLabelName(category.siteLabel);
  if (sameWords(words, shortWords) || sameWords(words, fullWords)) return MATCH_EXACT;
  if (words.every(function (word) { return fullWords.indexOf(word) !== -1; })) return MATCH_CLOSE;
  if (
    words.length === 1 &&
    words[0].length >= 5 &&
    fullWords.some(function (word) { return editDistance(words[0], word) <= 1; })
  ) {
    return MATCH_TYPO;
  }
  return 0;
}

/**
 * Assigns each category an existing label where one fits, best fits first; a label
 * serves at most one category. Existing labels are never renamed or recolored.
 * Returns {bySlug: {slug: labelId}, toCreate: [{slug, name, backgroundColor}], notes}.
 */
function matchLabels(existingLabels) {
  var labels = (existingLabels || []).filter(function (label) { return label && label.id; });
  var pairs = [];
  CATEGORIES.forEach(function (category, categoryIndex) {
    labels.forEach(function (label, labelIndex) {
      var score = labelScore(label.name, category);
      if (score > 0) pairs.push({ score: score, categoryIndex: categoryIndex, labelIndex: labelIndex });
    });
  });
  pairs.sort(function (a, b) {
    return b.score - a.score || a.labelIndex - b.labelIndex || a.categoryIndex - b.categoryIndex;
  });

  var bySlug = {};
  var labelTaken = {};
  var notes = [];
  pairs.forEach(function (pair) {
    var category = CATEGORIES[pair.categoryIndex];
    var label = labels[pair.labelIndex];
    if (bySlug[category.slug]) {
      if (bySlug[category.slug].score === pair.score && !labelTaken[label.id]) {
        notes.push('"' + label.name + '" also fits ' + category.slug + '; using "' + bySlug[category.slug].name + '"');
      }
      return;
    }
    if (labelTaken[label.id]) return;
    bySlug[category.slug] = { id: label.id, name: label.name, score: pair.score };
    labelTaken[label.id] = true;
  });

  var ids = {};
  var toCreate = [];
  CATEGORIES.forEach(function (category) {
    if (bySlug[category.slug]) {
      ids[category.slug] = bySlug[category.slug].id;
    } else {
      toCreate.push({ slug: category.slug, name: category.shortName, backgroundColor: category.color });
    }
  });
  return { bySlug: ids, toCreate: toCreate, notes: notes };
}

/**
 * The City of Bastrop calendar has no category field (its "ontology" text is a
 * free-form audience taxonomy), so city events are categorised from their title, then
 * their organizer. Rules are tried in order; the first match wins, which is why music
 * comes before food ("Wine Not? Wednesdays + Live Music").
 */
var CITY_CATEGORY_RULES = [
  { slug: 'government-civic', pattern: /\b(council|commission|board|committee|zoning|hearing)\b/i },
  { slug: 'music', pattern: /live music|concert|\bopry\b|\bband\b|drum circle|open mic|karaoke|\bchoir\b/i },
  { slug: 'markets-shopping', pattern: /farmer'?s'? market|farm stand|\bmarket\b|\bvendors?\b/i },
  { slug: 'family-kids', pattern: /\b(tweens?|teens?|kids?|children|family|preschool|toddlers?|storytime)\b/i },
  { slug: 'arts-entertainment', pattern: /\b(trivia|bingo|movie|film|theat(er|re))\b/i },
  { slug: 'sports-outdoors', pattern: /\b(hike|trail|nature|paddle|kayak|5k|run)\b/i },
  { slug: 'health-wellness', pattern: /\b(yoga|fitness|zumba|wellness|health|meditation)\b/i },
  { slug: 'food-drink', pattern: /\b(burger|happy hour|wine|beer|brew\w*|dinner|lunch|tasting)\b/i },
  { slug: 'education', pattern: /\b(class|workshop|club|conversation|lesson|book|knit\w*|sew\w*|fiber|craft)\b/i },
];

/** The city's account for official meetings; everything it posts is civic, whatever the title. */
var CITY_MEETINGS_ORGANIZER = /public meetings/i;

/** Fallbacks when the title says nothing, e.g. "Lighting of the Pines". */
var CITY_ORGANIZER_CATEGORIES = [
  { slug: 'education', pattern: /public library/i },
  { slug: 'community', pattern: /parks (&|and) recreation/i },
];

/** Canonical category slug for a City of Bastrop event, or null when nothing fits. */
function cityCategory(title, organizer) {
  if (CITY_MEETINGS_ORGANIZER.test(String(organizer || ''))) return 'government-civic';
  return firstMatch(CITY_CATEGORY_RULES, title) || firstMatch(CITY_ORGANIZER_CATEGORIES, organizer);
}

function firstMatch(rules, text) {
  var value = String(text || '');
  for (var i = 0; i < rules.length; i++) {
    if (rules[i].pattern.test(value)) return rules[i].slug;
  }
  return null;
}
