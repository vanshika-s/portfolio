import { fetchJSON, renderProjects } from "../global.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

let allProjects = [];
let query = "";
let selectedYear = null; // null = no year filter (show all)

/**
 * Given current global state (allProjects, query, selectedYear),
 * compute which projects should be visible.
 */
function getVisibleProjects() {
  return allProjects.filter((project) => {
    // text search across ALL metadata
    const values = Object.values(project).join("\n").toLowerCase();
    const matchesText = values.includes(query);

    // year filter (if any)
    const matchesYear = !selectedYear || project.year === selectedYear;

    return matchesText && matchesYear;
  });
}

/**
 * Render the pie chart + legend for a given list of projects.
 * Also wires up click handlers so wedges & legend items
 * update `selectedYear` and trigger a full re-render.
 */
function renderPieChart(projectList) {
  const svg = d3.select("#projects-pie-plot");
  const legend = d3.select(".legend");

  if (svg.empty()) return;

  // Clear previous chart + legend so we don't stack elements
  svg.selectAll("*").remove();
  legend.selectAll("*").remove();

  // If nothing visible, show a message and stop
  if (!projectList || projectList.length === 0) {
    legend.append("li").text("No projects match this search yet.");
    return;
  }

  // Group by year and count how many projects in each year
  const rolledData = d3.rollups(
    projectList,
    (v) => v.length, // count per year
    (d) => d.year    // key = project.year
  );

  // Optional: sort by year (numeric)
  rolledData.sort((a, b) => Number(a[0]) - Number(b[0]));

  // Convert to { value, label } objects for the chart
  const data = rolledData.map(([year, count]) => ({
    value: count,
    label: year,
  }));

  // Arc generator for slices
  const arcGenerator = d3.arc()
    .innerRadius(0)
    .outerRadius(50);

  // Pie layout: computes start/end angles based on `value`
  const sliceGenerator = d3.pie().value((d) => d.value);
  const arcData = sliceGenerator(data);       // [{ startAngle, endAngle, data: {…} }, …]
  const arcs = arcData.map((d) => arcGenerator(d)); // array of path strings

  // Color scale
  const colors = d3.scaleOrdinal(d3.schemeTableau10);

  // --- draw slices & wire up click-to-filter ---
  arcs.forEach((arc, idx) => {
    const yearLabel = data[idx].label;

    const path = svg.append("path")
      .attr("d", arc)
      .attr("fill", colors(idx))
      .classed("selected", selectedYear === yearLabel) // highlight if selected
      .on("click", () => {
        // Toggle selected year
        selectedYear = selectedYear === yearLabel ? null : yearLabel;
        updateView(); // re-render list + chart with new filter
      });
  });

  // --- build legend & wire up click-to-filter ---
  data.forEach((d, idx) => {
    const li = legend
      .append("li")
      .attr("style", `--color:${colors(idx)}`)
      .attr("class", "legend-item")
      .classed("selected", selectedYear === d.label)
      .html(`
        <span class="swatch"></span>
        ${d.label} <em>(${d.value})</em>
      `);

    li.on("click", () => {
      // Toggle selected year by clicking legend item
      selectedYear = selectedYear === d.label ? null : d.label;
      updateView();
    });
  });
}

/**
 * Main "render everything" function:
 *  - figures out which projects are visible (search + year filter)
 *  - renders the project cards
 *  - renders the pie chart & legend for those same projects
 */
function updateView() {
  const projectsContainer = document.querySelector(".projects");
  if (!projectsContainer) {
    console.error("No element with class 'projects' found.");
    return;
  }

  const visible = getVisibleProjects();

  // Render project cards
  renderProjects(visible, projectsContainer, "h2");

  // Update title with visible count (optional)
  const titleEl = document.querySelector(".projects-title");
  if (titleEl) {
    const totalCount = allProjects.length;
    const visibleCount = visible.length;
    if (visibleCount === totalCount) {
      titleEl.textContent = `Projects (${totalCount})`;
    } else {
      titleEl.textContent = `Projects (${visibleCount} of ${totalCount})`;
    }
  }

  // Render pie chart + legend from the SAME visible data
  renderPieChart(visible);
}

async function main() {
  // 1. Load project data from JSON
  const projects = await fetchJSON("../lib/projects.json");

  if (!projects || !Array.isArray(projects)) {
    const projectsContainer = document.querySelector(".projects");
    if (projectsContainer) {
      projectsContainer.textContent = "Unable to load projects right now.";
    }
    console.error("Could not load projects for projects page.");
    return;
  }

  // Save full list globally
  allProjects = projects;

  // 2. Initial render: no search, no selected year
  updateView();

  // 3. Wire up search bar
  const searchInput = document.querySelector(".searchBar");
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      query = event.target.value.toLowerCase();
      updateView();
    });
  }
}

main();

