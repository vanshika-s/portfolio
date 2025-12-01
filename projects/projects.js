import { fetchJSON, renderProjects } from "../global.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

async function main() {
  // 1. Load project data from JSON
  const projects = await fetchJSON("../lib/projects.json");

  // 2. Find the container on the page
  const projectsContainer = document.querySelector(".projects");

  if (!projectsContainer) {
    console.error("No element with class 'projects' found.");
    return;
  }

  // 3. If fetch failed, show a friendly message
  if (!projects || !Array.isArray(projects)) {
    projectsContainer.textContent = "Unable to load projects right now.";
    return;
  }

  // 4. Update the title with the number of projects
  const titleEl = document.querySelector(".projects-title");
  if (titleEl) {
    const count = projects.length;
    titleEl.textContent = `Projects (${count})`;
  }

  // 5. Render the projects into the container
  renderProjects(projects, projectsContainer, "h2");

  // ---------- D3 STATIC PIE CHART + LEGEND ----------
  const svg = d3.select("#projects-pie-plot");

  if (!svg.empty()) {
    // Arc generator for slices (radius 50)
    const arcGenerator = d3.arc()
      .innerRadius(0)
      .outerRadius(50);

    // Step 2.1: data now has labels + values
    const data = [
      { value: 1, label: "apples" },
      { value: 2, label: "oranges" },
      { value: 3, label: "mangos" },
      { value: 4, label: "pears" },
      { value: 5, label: "limes" },
      { value: 5, label: "cherries" },
    ];

    // Tell D3 which property holds the numeric value
    const sliceGenerator = d3.pie().value(d => d.value);
    const arcData = sliceGenerator(data);
    const arcs = arcData.map(d => arcGenerator(d));

    // Use a D3 ordinal color scale
    const colors = d3.scaleOrdinal(d3.schemeTableau10);

    // Draw one <path> per slice
    arcs.forEach((arc, idx) => {
      svg.append("path")
        .attr("d", arc)
        .attr("fill", colors(idx));
    });

    // Build the legend
    const legend = d3.select(".legend");

    data.forEach((d, idx) => {
      legend
        .append("li")
        .attr("style", `--color:${colors(idx)}`)
        .attr("class", "legend-item")
        .html(`
          <span class="swatch"></span>
          ${d.label} <em>(${d.value})</em>
        `);
    });
  }
}

main();