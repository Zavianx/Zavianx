import fs from 'node:fs/promises';

const login = process.env.GITHUB_LOGIN || 'Zavianx';
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error('GITHUB_TOKEN is required');
  process.exit(1);
}

const query = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
              weekday
            }
          }
        }
      }
    }
  }
`;

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Zavianx-profile-readme',
  },
  body: JSON.stringify({ query, variables: { login } }),
});

if (!response.ok) {
  console.error(`GitHub GraphQL request failed: ${response.status}`);
  process.exit(1);
}

const payload = await response.json();
const calendar = payload?.data?.user?.contributionsCollection?.contributionCalendar;

if (!calendar) {
  console.error('No contribution calendar returned from GitHub');
  process.exit(1);
}

const weeks = calendar.weeks || [];
const days = weeks.flatMap((week) => week.contributionDays || []);
const total = calendar.totalContributions || 0;

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const width = 880;
const height = 184;
const leftPad = 52;
const topPad = 54;
const cell = 11;
const gap = 3;
const cols = weeks.length;
const graphWidth = cols * (cell + gap) - gap;
const graphHeight = 7 * (cell + gap) - gap;

const dayCounts = new Map(days.map((day) => [day.date, day.contributionCount]));

const levelsLight = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const levelsDark = ['#21262d', '#0e4429', '#006d32', '#26a641', '#39d353'];

const monthIndices = [];
let previousMonth = null;
weeks.forEach((week, weekIndex) => {
  const weekDays = week.contributionDays || [];
  const firstDay = weekDays.find(Boolean);
  if (!firstDay) return;
  const month = new Date(firstDay.date + 'T00:00:00Z').getUTCMonth();
  if (month !== previousMonth) {
    monthIndices.push({ weekIndex, month });
    previousMonth = month;
  }
});

function renderSvg(theme) {
  const colors = theme === 'dark'
    ? {
        background: '#0d1117',
        text: '#c9d1d9',
        muted: '#8b949e',
        border: '#30363d',
        empty: levelsDark[0],
        levels: levelsDark,
      }
    : {
        background: '#ffffff',
        text: '#24292f',
        muted: '#57606a',
        border: '#d0d7de',
        empty: levelsLight[0],
        levels: levelsLight,
      };

  const monthY = 42;
  const headerY = 22;
  const graphY = topPad;

  const monthTexts = monthIndices.map(({ weekIndex, month }) => {
    const x = leftPad + weekIndex * (cell + gap);
    return `<text x="${x}" y="${monthY}" text-anchor="start" font-size="10" fill="${colors.muted}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${monthNames[month]}</text>`;
  }).join('');

  const weekdayTexts = weekdayLabels.map((label, index) => {
    const y = graphY + index * (cell + gap) + 10;
    return `<text x="${12}" y="${y}" font-size="10" fill="${colors.muted}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${label}</text>`;
  }).join('');

  const rects = weeks.map((week, weekIndex) => {
    return (week.contributionDays || []).map((day) => {
      const x = leftPad + weekIndex * (cell + gap);
      const y = graphY + day.weekday * (cell + gap);
      const count = day.contributionCount;
      const level = day.contributionLevel;
      const fill = count === 0 ? colors.empty : colors.levels[Math.min(colors.levels.length - 1, ['FIRST_QUARTILE','SECOND_QUARTILE','THIRD_QUARTILE','FOURTH_QUARTILE'].indexOf(level) + 1)];
      const label = `${day.date}: ${count} contributions`;
      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${fill}">
        <title>${label}</title>
      </rect>`;
    }).join('');
  }).join('');

  const lessX = leftPad;
  const moreX = leftPad + graphWidth - 18;
  const legendY = graphY + graphHeight + 28;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${login} contribution graph</title>
  <desc id="desc">${total} contributions in the last year</desc>
  <rect width="100%" height="100%" fill="${colors.background}"/>
  <text x="12" y="${headerY}" font-size="14" font-weight="600" fill="${colors.text}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${total} contributions in the last year</text>
  ${monthTexts}
  ${weekdayTexts}
  ${rects}
  <text x="${lessX}" y="${legendY}" font-size="10" fill="${colors.muted}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">Less</text>
  <text x="${moreX}" y="${legendY}" font-size="10" fill="${colors.muted}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">More</text>
  <g transform="translate(${leftPad + 52} ${legendY - 8})">
    ${colors.levels.map((fill, index) => `<rect x="${index * 18}" y="0" width="10" height="10" rx="2" fill="${fill}"/>`).join('')}
  </g>
</svg>`;
}

await fs.mkdir('dist', { recursive: true });
await fs.writeFile('dist/github-contribution-graph.svg', renderSvg('light'));
await fs.writeFile('dist/github-contribution-graph-dark.svg', renderSvg('dark'));
console.log(`Generated graph for ${login}: ${total} contributions`);
