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
        enumerable: false,
        writable: false,
        configurable: false,
      });

      return ret;
    });
}

// 3. Render the “GitHub-stats–style” summary block
function renderCommitInfo(data, commits) {
  const container = d3.select("#stats");

  container.append("h2").text("Summary");

  const dl = container.append("dl").attr("class", "stats");

  function addStat(label, value, isLOC = false) {
    const dt = dl.append("dt");
    if (isLOC && label.toLowerCase().includes("loc")) {
      dt.html(
        'TOTAL <abbr title="Lines of code">LOC</abbr>'
      );
    } else {
      dt.text(label.toUpperCase());
    }
    dl.append("dd").text(value);
  }

  // Total LOC = one row per line
  addStat("Total LOC", data.length, true);

  // Total commits
  addStat("Commits", commits.length);

  // Number of files
  const fileCount = d3.group(data, (d) => d.file).size;
  addStat("Files", fileCount);

  // Max depth
  const maxDepth = d3.max(data, (d) => d.depth);
  addStat("Max depth", maxDepth);

  // Longest line length in characters
  const longestLineLen = d3.max(data, (d) => d.length);
  addStat("Longest line", longestLineLen);

  // Max lines in a single file
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
    (d) => d.file
  );
  const maxLinesInFile = d3.max(fileLengths, (d) => d[1]);
  addStat("Max lines", maxLinesInFile);
}

// 4. Scatterplot of commit datetime vs time-of-day
function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;

  // --- margins & usable area ---
  const margin = { top: 10, right: 10, bottom: 30, left: 20 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select("#chart")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("overflow", "visible");

  // --- scales ---
  const xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  const yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // --- axes ---
  const xAxis = d3.axisBottom(xScale);

  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, "0") + ":00");

  // X axis at bottom of usable area
  svg
    .append("g")
    .attr("transform", `translate(0, ${usableArea.bottom})`)
    .call(xAxis);

  // Y axis at left of usable area
  svg
    .append("g")
    .attr("transform", `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  // --- dots ---
  const dots = svg.append("g").attr("class", "dots");

  dots
    .selectAll("circle")
    .data(commits)
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", 5)
    .attr("fill", "steelblue");
}

// ---- main top-level flow ----
const data = await loadData();
const commits = processCommits(data);

console.log("LOC rows:", data.length);
console.log("Commit objects:", commits);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
