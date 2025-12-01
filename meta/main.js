// meta/main.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// 1. Load + clean the CSV rows (one object per line of code)
async function loadData() {
  const data = await d3.csv("loc.csv", (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + "T00:00" + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

// 2. Turn line-level data into commit-level data
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit) // [ [commitId, lines[]], ... ]
    .map(([commit, lines]) => {
      const first = lines[0];
      const { author, date, time, timezone, datetime } = first;

      const ret = {
        id: commit,
        // TODO: change this to YOUR repo URL if you want clickable links:
        // e.g. 'https://github.com/vanshika-s/portfolio/commit/' + commit
        url: "https://github.com/vanshika-s/portfolio/commit/" + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        // fractional hour, e.g. 14.5 for 2:30pm
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        // how many lines this commit touches
        totalLines: lines.length,
      };

      // Keep the raw lines, but hide them from normal console.log / loops
      Object.defineProperty(ret, "lines", {
        value: lines,
        enumerable: false,   // don't show up in for...in / Object.keys / console
        writable: false,     // we won't accidentally overwrite it
        configurable: false, // can't be redefined
      });

      return ret;
    });
}

// 3. Load everything and inspect in console for now
const data = await loadData();
const commits = processCommits(data);

console.log("LOC rows:", data.length);
console.log("Commit objects:", commits);
