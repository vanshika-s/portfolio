// meta/main.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// ---------- 1. Load + clean LOC CSV ----------
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

// ---------- global state for slider + scales ----------
let commitProgress = 100;     // 0–100 (slider)
let commitMaxTime = null;     // Date corresponding to slider
let filteredCommits = [];     // commits visible right now
let timeScale = null;         // maps datetime -> 0–100

// data/commits for reuse in handlers
let allData = [];
let allCommits = [];

// xScale shared between first render & updates
let xScale;

// ---------- 2. Turn line-level data into commit-level data ----------
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
        // fractional hour, e.g. 14.5 for 2:30 pm
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length, // how many lines this commit touches
      };

      // keep the raw lines, but hide them from normal loops
      Object.defineProperty(ret, "lines", {
        value: lines,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      return ret;
    });
}

// ---------- 3. Commit summary block ----------
function renderCommitInfo(data, commits) {
  const container = d3.select("#stats");
  container.html(""); // clear if re-calling

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

  // Total LOC
  addStat("Total LOC", data.length, true);

  // Total commits
  addStat("Commits", commits.length);

  // Number of files
  const fileCount = d3.group(data, (d) => d.file).size;
  addStat("Files", fileCount);

  // Max depth
  const maxDepth = d3.max(data, (d) => d.depth);
  addStat("Max depth", maxDepth);

  // Longest line length
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
  if (!commit || Object.keys(commit).length === 0) return;

  const link = document.getElementById("commit-link");
  const date = document.getElementById("commit-date");
  const timeEl = document.getElementById("commit-tooltip-time");
  const author = document.getElementById("commit-author");
  const lines = document.getElementById("commit-lines");

  link.href = commit.url;
  link.textContent = commit.id.slice(0, 7); // short hash

  date.textContent = commit.datetime?.toLocaleString("en", {
    dateStyle: "full",
  });

  timeEl.textContent = commit.datetime?.toLocaleTimeString("en", {
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

  const rect = tooltip.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - offset;
  const maxY = window.innerHeight - rect.height - offset;

  x = Math.max(offset, Math.min(x, maxX));
  y = Math.max(offset, Math.min(y, maxY));

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

// selection count / language breakdown (unchanged)
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

// ---------- 5. Scatterplot ----------
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

  // --- scales ---
  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  const yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([3, 20]);

  // --- gridlines ---
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

  // --- axes ---
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, "0") + ":00");

  svg
    .append("g")
    .attr("transform", `translate(0, ${usableArea.bottom})`)
    .attr("class", "x-axis") // mark so we can update later
    .call(xAxis);

  svg
    .append("g")
    .attr("transform", `translate(${usableArea.left}, 0)`)
    .attr("class", "y-axis")
    .call(yAxis);

  // --- dots ---
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
  const dots = svg.append("g").attr("class", "dots");

  dots
    .selectAll("circle")
    .data(sortedCommits, (d) => d.id) // key by commit id
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

  // --- brushing helper ---
  function createBrushSelector(svgEl, dotsGroup, xScale, yScale, commits) {
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

      dotsGroup
        .selectAll("circle")
        .classed("selected", (d) => isCommitSelected(selection, d));

      renderSelectionCount(selection, commits, isCommitSelected);
      renderLanguageBreakdown(selection, commits, isCommitSelected);
    }

    svgEl.call(brush);
    svgEl.selectAll(".dots, .overlay ~ *").raise();
  }

  createBrushSelector(svg, dots, xScale, yScale, commits);
}

// ---------- 6. Update scatterplot when slider changes ----------
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

  // update x-scale domain based on filtered commits
  xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

  const yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([3, 20]);

  const xAxis = d3.axisBottom(xScale);

  // replace x-axis
  const xAxisGroup = svg.select("g.x-axis");
  xAxisGroup.selectAll("*").remove();
  xAxisGroup.call(xAxis);

  const dots = svg.select("g.dots");

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  dots
    .selectAll("circle")
    .data(sortedCommits, (d) => d.id) // keep circles stable
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

// ---------- 7. Slider helpers ----------
function initTimeScale(commits) {
  timeScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([0, 100]);

  commitMaxTime = timeScale.invert(commitProgress);
  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
}

function onTimeSliderChange() {
  const slider = document.getElementById("commit-progress");
  const label = document.getElementById("commit-max-time");

  commitProgress = Number(slider.value);
  commitMaxTime = timeScale.invert(commitProgress);

  // update label under the slider
  label.textContent = commitMaxTime.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  // recompute which commits to show
  filteredCommits = allCommits.filter((d) => d.datetime <= commitMaxTime);

  // update scatter
  updateScatterPlot(allData, filteredCommits);
}

// ---------- 8. Main top-level flow ----------
const data = await loadData();
const commits = processCommits(data);

allData = data;
allCommits = commits;

console.log("LOC rows:", data.length);
console.log("Commit objects:", commits);

// initialise time scale & filtered commits *before* rendering
initTimeScale(commits);

// summary uses all commits (like the demo)
renderCommitInfo(data, commits);

// initial scatterplot uses filteredCommits (which == all commits at start)
renderScatterPlot(data, filteredCommits);

// wire up slider
const sliderEl = document.getElementById("commit-progress");
if (sliderEl) {
  sliderEl.addEventListener("input", onTimeSliderChange);
}

// initialise label text once
onTimeSliderChange();
