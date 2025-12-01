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
        // change to YOUR repo URL (already done here):
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
        enumerable: false,   // don't show up in for...in / Object.keys
        writable: false,
        configurable: false,
      });

      return ret;
    });
}

// 3. Render high-level stats into #stats
function renderCommitInfo(data, commits) {
  const dl = d3.select("#stats").append("dl").attr("class", "stats");

  // --- Required stats ---
  dl.append("dt").html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append("dd").text(data.length);

  dl.append("dt").text("Total commits");
  dl.append("dd").text(commits.length);

  // --- Extra stats ---

  // 1) Number of files
  const numFiles = d3.group(data, (d) => d.file).size;
  dl.append("dt").text("Files in project");
  dl.append("dd").text(numFiles);

  // 2) Longest file (by line count)
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
    (d) => d.file
  );
  const longestFile = d3.greatest(fileLengths, (d) => d[1]);
  dl.append("dt").text("Longest file");
  dl.append("dd").text(`${longestFile[0]} (${longestFile[1]} lines)`);

  // 3) Average line length (characters)
  const avgLineLength = d3.mean(data, (d) => d.length);
  dl.append("dt").text("Average line length");
  dl.append("dd").text(avgLineLength.toFixed(1) + " chars");

  // 4) Time of day with most work
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) =>
      new Date(d.datetime).toLocaleString("en", { dayPeriod: "short" }) // e.g. "morning"
  );
  const busiestPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
  dl.append("dt").text("Most active time of day");
  dl.append("dd").text(busiestPeriod ?? "–");
}

// 4. Load everything, process, and render
const data = await loadData();
const commits = processCommits(data);

// Optional console sanity checks
console.log("LOC rows:", data.length);
console.log("Commit objects:", commits);

renderCommitInfo(data, commits);
