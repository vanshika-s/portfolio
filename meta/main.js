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

// -------- slider + scales state --------

// slider state
let commitProgress = 100;      // percentage (0–100)
let commitMaxTime = null;      // Date corresponding to slider
let filteredCommits = [];      // commits currently visible

// will be set after commits are loaded
let timeScale = null;

// x/y scales shared between initial render + updates
let xScale;
let yScale;

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

  // clear previous summary if we ever call this again
  container.html("");

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

  // Total LOC = one row per line (still always from full data)
  addStat("Total LOC", data.length, true);

  // Total commits (now uses *filtered* commits)
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

// 4. Tooltip content
function renderTooltipContent(commit) {
  const link = document.getElementById("commit-link");
  const date = document.getElementById("commit-date");
  const time = document.getElementById("commit-time"); // tooltip time
  const author = document.getElementById("commit-author");
  const lines = document.getElementById("commit-lines");

  if (!commit || Object.keys(commit).length === 0) {
    return;
  }

  link.href = commit.url;
  link.textContent = commit.id.slice(0, 7); // short hash

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

  // Start by placing it just below/right of the cursor
  let x = event.clientX + offset;
  let y = event.clientY + offset;

  const tooltipRect = tooltip.getBoundingClientRect();
  const maxX = window.innerWidth - tooltipRect.width - offset;
  const maxY = window.innerHeight - tooltipRect.height - offset;

  // Clamp so it stays fully on–screen
  x = Math.max(offset, Math.min(x, maxX));
  y = Math.max(offset, Math.min(y, maxY));

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

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

  // If nothing selected, clear and bail
  if (selectedCommits.length === 0) {
    container.innerHTML = "";
    return;
  }

  // All line-level rows from those commits
  const lines = selectedCommits.flatMap((d) => d.lines);

  // Count lines per language (row.type is the language)
  const breakdown = d3.rollup(
    lines,
    (v) => v.length, // number of lines
    (d) => d.type    // language / type
  );

  // Clear previous content
  container.innerHTML = "";

  // One block per language: LANGUAGE on top, lines + percent stacked below
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

// 5. Scatterplot of commit datetime vs time-of-day
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

  // --- scales (global xScale / yScale) ---
  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // --- radius scale (lines edited -> dot size) ---
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3
    .scaleSqrt()                         // area ∝ lines edited
    .domain([minLines, maxLines])
    .range([3, 20]);                     // tweak if you want bigger/smaller dots

  // --- gridlines (drawn before axes & dots) ---
  const gridlines = svg
    .append("g")
    .attr("class", "gridlines")
    .attr("transform", `translate(${usableArea.left}, 0)`);

  gridlines.call(
    d3.axisLeft(yScale)
      .tickFormat("")
      .tickSize(-usableArea.width)
  );

  gridlines
    .selectAll("line")
    .attr("stroke", (d) => {
      const h = d % 24;
      if (h < 6 || h >= 20) return "#1e3a8a"; // night
      if (h < 12) return "#f97316";           // morning
      if (h < 18) return "#0ea5e9";           // afternoon
      return "#2563eb";                       // evening
    })
    .attr("stroke-opacity", 0.4)
    .attr("stroke-width", 1.2);

  // --- axes ---
  const xAxis = d3.axisBottom(xScale);

  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, "0") + ":00");

  svg
    .append("g")
    .attr("transform", `translate(0, ${usableArea.bottom})`)
    .attr("class", "x-axis")              // 👈 mark x-axis for updates
    .call(xAxis);

  svg
    .append("g")
    .attr("transform", `translate(${usableArea.left}, 0)`)
    .attr("class", "y-axis")              // 👈 just for consistency
    .call(yAxis);

  // --- dots (sorted so small ones are on top) ---
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  const dots = svg.append("g").attr("class", "dots");

  dots
    .selectAll("circle")
    .data(sortedCommits)
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", (d) => rScale(d.totalLines))
    .attr("fill", "steelblue")
    .style("fill-opacity", 0.7)
    .on("mouseenter", (event, commit) => {
      d3.select(event.currentTarget).style("fill-opacity", 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on("mousemove", (event) => {
      // keeps tooltip glued to the cursor while hovering
      updateTooltipPosition(event);
    })
    .on("mouseleave", (event) => {
      d3.select(event.currentTarget).style("fill-opacity", 0.7);
      updateTooltipVisibility(false);
    });

  // --- brushing -------------------------------------------------
  function createBrushSelector(svg, dotsGroup, xScale, yScale, commits) {
    const brush = d3.brush()
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

      // highlight circles
      dotsGroup
        .selectAll("circle")
        .classed("selected", (d) => isCommitSelected(selection, d));

      // update text + language breakdown
      renderSelectionCount(selection, commits, isCommitSelected);
      renderLanguageBreakdown(selection, commits, isCommitSelected);
    }

    svg.call(brush);

    // keep dots & later elements above the brush overlay
    svg.selectAll(".dots, .overlay ~ *").raise();
  }

  // call it after dots are drawn
  createBrushSelector(svg, dots, xScale, yScale, commits);
}

// ---- updateScatterPlot: called by slider ----
function updateScatterPlot(data, commits) {
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

  const svg = d3.select("#chart").select("svg");
  if (svg.empty()) return;

  // update xScale domain to the new commit range
  xScale = xScale
    .domain(d3.extent(commits, (d) => d.datetime))
    .nice();

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3
    .scaleSqrt()
    .domain([minLines, maxLines])
    .range([3, 20]);

  const xAxis = d3.axisBottom(xScale);

  // update existing x-axis instead of adding a new one
  const xAxisGroup = svg.select("g.x-axis");
  xAxisGroup.call(xAxis);

  // update dots
  const dots = svg.select("g.dots");
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  dots
    .selectAll("circle")
    .data(sortedCommits)
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", (d) => rScale(d.totalLines))
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

// ---- slider helpers ----

function formatCommitTime(date) {
  return date.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function onTimeSliderChange() {
  const slider = document.getElementById("commit-progress");
  const timeEl = document.getElementById("commit-slider-time");

  if (!slider || !timeEl || !timeScale) return;

  commitProgress = Number(slider.value);          // 0–100
  commitMaxTime = timeScale.invert(commitProgress);

  // update <time> text in the header
  timeEl.textContent = formatCommitTime(commitMaxTime);

  // filter commits up to this time
  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);

  // update summary + plot using filtered commits
  renderCommitInfo(data, filteredCommits);
  updateScatterPlot(data, filteredCommits);
}

// ---- main top-level flow ----
const data = await loadData();
const commits = processCommits(data);

console.log("LOC rows:", data.length);
console.log("Commit objects:", commits);

// set up timeScale / slider domain
timeScale = d3
  .scaleTime()
  .domain(d3.extent(commits, (d) => d.datetime))
  .range([0, 100]);

commitProgress = 100;
commitMaxTime = timeScale.invert(commitProgress);
filteredCommits = commits;

// initial render with all commits
renderCommitInfo(data, filteredCommits);
renderScatterPlot(data, filteredCommits);

// wire up the slider after initial render
const sliderEl = document.getElementById("commit-progress");
if (sliderEl) {
  sliderEl.value = String(commitProgress);
  sliderEl.addEventListener("input", onTimeSliderChange);
  // initialize header time text
  onTimeSliderChange();
}
