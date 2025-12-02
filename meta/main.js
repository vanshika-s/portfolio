// meta/main.js
import "../global.js"; // nav + theme toggle
// meta/main.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// --------------- 1. Load + clean data ---------------

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

// --------------- global slider / scales state ---------------

let commitProgress = 100;       // 0–100 %
let commitMaxTime = null;       // Date cut-off for commits
let filteredCommits = [];       // commits visible at the moment
let timeScale = null;           // maps Date <-> [0,100]

// shared between initial render + updates
let xScale;
let yScale;
let rScale;
let dotsGroup;                  // <g class="dots"> containing circles

// --------------- 2. Turn line-level rows into commit objects ---------------

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

// --------------- 3. Summary stats block ---------------

function renderCommitInfo(data, commits) {
  const container = d3.select("#stats");

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

// --------------- 4. Tooltip helpers ---------------

function renderTooltipContent(commit) {
  const link = document.getElementById("commit-link");
  const date = document.getElementById("commit-date");
  const time = document.getElementById("commit-time");
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

// --------------- 5. Selection + language breakdown ---------------

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

// --------------- 6. NEW: file unit visualization ---------------

function updateFileDisplay(commits) {
  const container = d3.select("#files");
  if (container.empty()) return;

  // flatten all line-level rows from the currently visible commits
  const lines = commits.flatMap((d) => d.lines);

  // group by file name
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }));

  // bind data to <div> children inside #files
  const filesContainer = container
    .selectAll("div")
    .data(files, (d) => d.name)
    .join(
      (enter) =>
        enter.append("div").call((div) => {
          div.append("dt").append("code");
          div.append("dd");
        }),
      (update) => update,
      (exit) => exit.remove()
    );

  // update filenames + line counts
  filesContainer.select("dt > code").text((d) => d.name);
  filesContainer.select("dd").text((d) => `${d.lines.length} lines`);
}

// --------------- 7. Scatterplot ---------------

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

  // --- scales (saved globally) ---
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
  rScale = d3
    .scaleSqrt()
    .domain([minLines, maxLines])
    .range([3, 20]);

  // --- gridlines (time-of-day coloring) ---
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
    .attr("class", "x-axis")
    .call(xAxis);

  svg
    .append("g")
    .attr("transform", `translate(${usableArea.left}, 0)`)
    .attr("class", "y-axis")
    .call(yAxis);

  // --- dots ---
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
  dotsGroup = svg.append("g").attr("class", "dots");

  const dots = dotsGroup
    .selectAll("circle")
    .data(sortedCommits, (d) => d.id) // key by commit id (1.3)
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", (d) => rScale(d.totalLines))
    .attr("fill", "steelblue")
    .style("fill-opacity", 0.7);

  dots
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

  // --- brushing -------------------------------------------------
  function createBrushSelector(svgEl, dotsGroupEl, xScaleEl, yScaleEl, commitsEl) {
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
      const cx = xScaleEl(commit.datetime);
      const cy = yScaleEl(commit.hourFrac);
      return x0 <= cx && cx <= x1 && y0 <= cy && cy <= y1;
    }

    function brushed(event) {
      const selection = event.selection;

      dotsGroupEl
        .selectAll("circle")
        .classed("selected", (d) => isCommitSelected(selection, d));

      renderSelectionCount(selection, commitsEl, isCommitSelected);
      renderLanguageBreakdown(selection, commitsEl, isCommitSelected);
    }

    svgEl.call(brush);
    svgEl.selectAll(".dots, .overlay ~ *").raise();
  }

  createBrushSelector(svg, dotsGroup, xScale, yScale, commits);
}

// --- update function used by the slider ---

function updateScatterPlot(data, commits) {
  if (!dotsGroup) return;

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

  xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  rScale.domain([minLines, maxLines]);

  const xAxis = d3.axisBottom(xScale);
  const xAxisGroup = svg.select("g.x-axis");
  xAxisGroup.call(xAxis);

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  const dots = dotsGroup
    .selectAll("circle")
    .data(sortedCommits, (d) => d.id) // keyed join keeps circles stable
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", (d) => rScale(d.totalLines))
    .attr("fill", "steelblue")
    .style("fill-opacity", 0.7);

  dots
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

// --------------- 8. Top-level flow ---------------

const data = await loadData();
const commits = processCommits(data);

console.log("LOC rows:", data.length);
console.log("Commit objects:", commits);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);

// ----- slider + filtering -----

timeScale = d3
  .scaleTime()
  .domain(d3.extent(commits, (d) => d.datetime))
  .range([0, 100]);

commitMaxTime = timeScale.invert(commitProgress);
filteredCommits = commits;

const sliderEl = document.getElementById("commit-progress");
const timeEl = document.getElementById("commit-max-time");

function onTimeSliderChange() {
  commitProgress = Number(sliderEl.value);
  commitMaxTime = timeScale.invert(commitProgress);

  if (timeEl) {
    timeEl.textContent = commitMaxTime.toLocaleString("en", {
      dateStyle: "long",
      timeStyle: "short",
    });
  }

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);

  updateScatterPlot(data, filteredCommits);
  updateFileDisplay(filteredCommits);   // NEW: keep file list in sync
}

if (sliderEl) {
  sliderEl.addEventListener("input", onTimeSliderChange);
  onTimeSliderChange(); // initialize display + filtered plot + file list
}
