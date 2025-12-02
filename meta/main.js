// meta/main.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// ---------- 1. Load + clean CSV (one row per line of code) ----------
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

// slider state
let commitProgress = 100;      // percentage (0–100)
let commitMaxTime = null;      // Date corresponding to slider
let filteredCommits = [];      // commits currently visible

// time scale for slider
let timeScale = null;

// xScale / yScale shared between render + update
let xScale;
let yScale;

// ---------- 2. Turn line-level data into commit-level objects ----------
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit) // [[commitId, lines[]], ...]
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

      // keep raw lines, non-enumerable
      Object.defineProperty(ret, "lines", {
        value: lines,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      return ret;
    });
}

// ---------- 3. Summary block (GitHub-style) ----------
function renderCommitInfo(data, commits) {
  const container = d3.select("#stats");
  container.selectAll("*").remove(); // clear previous summary

  container.append("h2").text("Summary");

  const dl = container.append("dl").attr("class", "stats");

  function addStat(label, value, isLOC = false) {
    const dt = dl.append("dt");
    if (isLOC && label.toLowerCase().includes("loc")) {
      dt.html('TOTAL <abbr title="Lines of code">LOC</abbr>');
    } else {
      dt.text(label.toUpperCase());
    }
    dl.append("dd").text(value);
  }

  if (!data.length || !commits.length) {
    addStat("Total LOC", 0, true);
    addStat("Commits", 0);
    addStat("Files", 0);
    addStat("Max depth", 0);
    addStat("Longest line", 0);
    addStat("Max lines", 0);
    return;
  }

  // Total LOC = one row per line (within the filtered range)
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

// ---------- 4. Tooltip helpers ----------
function renderTooltipContent(commit) {
  const link = document.getElementById("commit-link");
  const date = document.getElementById("commit-date");
  const time = document.getElementById("commit-time");
  const author = document.getElementById("commit-author");
  const lines = document.getElementById("commit-lines");

  if (!commit || Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id.slice(0, 7);

  date.textContent = commit.datetime?.toLocaleString("en", {
    dateStyle: "full",
  });

  time.textContent = commit.datetime?.toLocaleTimeString("en", {
    hour: "2-digit",
    minute: "2-digit",
  });

  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById("commit-tooltip");
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById("commit-tooltip");
  const offset = 12;

  let x = event.clientX + offset;
  let y = event.clientY + offset;

  const tooltipRect = tooltip.getBoundingClientRect();
  const maxX = window.innerWidth - tooltipRect.width - offset;
  const maxY = window.innerHeight - tooltipRect.height - offset;

  x = Math.max(offset, Math.min(x, maxX));
  y = Math.max(offset, Math.min(y, maxY));

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

// ---------- 5. Selection + language breakdown ----------
function renderSelectionCount(selection, commits, isCommitSelected) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector("#selection-count");
  countElement.textContent = `${
    selectedCommits.length || "No"
  } commits selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection, commits, isCommitSelected) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];

  const container = document.getElementById("language-breakdown");

  if (selectedCommits.length === 0) {
    container.innerHTML = "";
    return;
  }

  const requiredCommits = selectedCommits.length ? selectedCommits : commits;
  const lines = requiredCommits.flatMap((d) => d.lines);

  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type
  );

  container.innerHTML = "";

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format(".1~%")(proportion);

    container.innerHTML += `
      <dt>${language}</dt>
      <dd>
        <span class="lines">${count} lines</span>
        <span class="percent">(${formatted})</span>
      </dd>
    `;
  }
}

// ---------- 6. Files list (Step 2.1) ----------
// ---------- 6. Files list (Step 2.1 + 2.2) ----------
function updateFileDisplay(commitsForFiles) {
  const container = d3.select("#files");

  // If no commits in range, clear and bail
  if (!commitsForFiles.length) {
    container.selectAll("*").remove();
    return;
  }

  // All line-level rows from the commits in range
  const lines = commitsForFiles.flatMap((d) => d.lines);

  // Group by file
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }));

  // One <div> wrapper per file
  const filesContainer = container
    .selectAll("div")
    .data(files, (d) => d.name)
    .join((enter) =>
      enter.append("div").call((div) => {
        div.append("dt");
        div.append("dd");
      })
    );

  // dt: filename + tiny "N lines" underneath
  filesContainer
    .select("dt")
    .html((d) => {
      return `<code>${d.name}</code><small>${d.lines.length} lines</small>`;
    });

  // dd: unit visualization — one .loc div per *line*
  const dd = filesContainer.select("dd");

  dd.selectAll("div")
    .data((d) => d.lines)
    .join("div")
    .attr("class", "loc");
}

// ---------- 7. Scatterplot ----------
function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
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

  // shared scales
  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([3, 20]);

  // gridlines (colored by time of day)
  const gridlines = svg
    .append("g")
    .attr("class", "gridlines")
    .attr("transform", `translate(${usableArea.left}, 0)`);

  gridlines.call(
    d3.axisLeft(yScale).tickFormat("").tickSize(-usableArea.width)
  );

  gridlines
    .selectAll("line")
    .attr("stroke", (d) => {
      const h = d % 24;
      if (h < 6 || h >= 20) return "#1e3a8a"; // night
      if (h < 12) return "#f97316"; // morning
      if (h < 18) return "#0ea5e9"; // afternoon
      return "#2563eb"; // evening
    })
    .attr("stroke-opacity", 0.4)
    .attr("stroke-width", 1.2);

  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, "0") + ":00");

  svg
    .append("g")
    .attr("transform", `translate(0, ${usableArea.bottom})`)
    .attr("class", "x-axis")
    .call(xAxis);

  svg
    .append("g")
    .attr("transform", `translate(${usableArea.left}, 0)`)
    .attr("class", "y-axis")
    .call(yAxis);

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
  const dots = svg.append("g").attr("class", "dots");

  dots
    .selectAll("circle")
    .data(sortedCommits, (d) => d.id) // key = commit id (1.3)
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", function (d) {
      const r = rScale(d.totalLines);
      this.style.setProperty("--r", r); // for CSS timing if you want it
      return r;
    })
    .attr("fill", "steelblue")
    .style("fill-opacity", 0.7)
    .on("mouseenter", (event, commit) => {
      d3.select(event.currentTarget).style("fill-opacity", 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on("mousemove", (event) => {
      updateTooltipPosition(event);
    })
    .on("mouseleave", (event) => {
      d3.select(event.currentTarget).style("fill-opacity", 0.7);
      updateTooltipVisibility(false);
    });

  // ---------- brush (selection rectangle) ----------
  const brush = d3
    .brush()
    .extent([
      [usableArea.left, usableArea.top],
      [usableArea.right, usableArea.bottom],
    ])
    .on("start brush end", brushed);

  function isCommitSelected(selection, commit) {
    if (!selection) return false;
    const [[x0, y0], [x1, y1]] = selection;
    const cx = xScale(commit.datetime);
    const cy = yScale(commit.hourFrac);
    return x0 <= cx && cx <= x1 && y0 <= cy && cy <= y1;
  }

  function brushed(event) {
    const selection = event.selection;

    dots
      .selectAll("circle")
      .classed("selected", (d) => isCommitSelected(selection, d));

    renderSelectionCount(selection, commits, isCommitSelected);
    renderLanguageBreakdown(selection, commits, isCommitSelected);
  }

  svg.append("g").attr("class", "brush").call(brush);
}

function updateScatterPlot(data, commits) {
  const svg = d3.select("#chart").select("svg");
  if (svg.empty()) return;

  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 20 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  // update x scale domain
  xScale = xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([3, 20]);

  const xAxis = d3.axisBottom(xScale);

  // clear + redraw x-axis
  const xAxisGroup = svg.select("g.x-axis");
  xAxisGroup.selectAll("*").remove();
  xAxisGroup.attr("transform", `translate(0, ${usableArea.bottom})`).call(xAxis);

  const dots = svg.select("g.dots");
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  dots
    .selectAll("circle")
    .data(sortedCommits, (d) => d.id) // key = commit id (1.3)
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", function (d) {
      const r = rScale(d.totalLines);
      this.style.setProperty("--r", r);
      return r;
    })
    .attr("fill", "steelblue")
    .style("fill-opacity", 0.7)
    .on("mouseenter", (event, commit) => {
      d3.select(event.currentTarget).style("fill-opacity", 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on("mousemove", (event) => {
      updateTooltipPosition(event);
    })
    .on("mouseleave", (event) => {
      d3.select(event.currentTarget).style("fill-opacity", 0.7);
      updateTooltipVisibility(false);
    });
}

// ---------- 8. Slider handler ----------
function makeSliderHandler(data, commits) {
  const sliderEl = document.getElementById("commit-progress");
  const timeEl = document.getElementById("commit-max-time");

  return function onTimeSliderChange() {
    commitProgress = Number(sliderEl.value);
    commitMaxTime = timeScale.invert(commitProgress);

    if (timeEl) {
      timeEl.textContent = commitMaxTime.toLocaleString("en", {
        dateStyle: "long",
        timeStyle: "short",
      });
    }

    filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
    const filteredData = filteredCommits.flatMap((d) => d.lines);

    updateScatterPlot(data, filteredCommits);
    updateFileDisplay(filteredCommits);
    renderCommitInfo(filteredData, filteredCommits);
  };
}

// ---------- 9. Top-level flow ----------
const data = await loadData();
const commits = processCommits(data);

console.log("LOC rows:", data.length);
console.log("Commit objects:", commits);

// initial full-range state
filteredCommits = commits.slice();

// initial summary / chart / files
renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
updateFileDisplay(commits);

// setup time scale + slider
timeScale = d3
  .scaleTime()
  .domain(d3.extent(commits, (d) => d.datetime))
  .range([0, 100]);

commitMaxTime = timeScale.invert(commitProgress);

const sliderHandler = makeSliderHandler(data, commits);
const sliderEl = document.getElementById("commit-progress");
if (sliderEl) {
  sliderEl.value = String(commitProgress);
  sliderEl.addEventListener("input", sliderHandler);
  sliderHandler(); // initialize UI + filtered views
}
