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

  // ---------- D3 PIE CHART + LEGEND USING REAL PROJECT YEARS ----------
  const svg = d3.select("#projects-pie-plot");

  if (!svg.empty()) {
    // 1. Group projects by year and count them
    const rolledData = d3.rollups(
      projects,
      (v) => v.length,   // how many projects in that year
      (d) => d.year      // group key = project.year
    );

    // Optional: sort years numerically so legend is in order
    rolledData.sort((a, b) => Number(a[0]) - Number(b[0]));

    // 2. Convert to { value, label } for the chart
    const data = rolledData.map(([year, count]) => ({
      value: count,
      label: year,
    }));

    // 3. Arc generator for slices (radius 50)
    const arcGenerator = d3.arc()
      .innerRadius(0)
      .outerRadius(50);

    // 4. Use d3.pie to compute angles based on value
    const sliceGenerator = d3.pie().value((d) => d.value);
    const arcData = sliceGenerator(data);
    const arcs = arcData.map((d) => arcGenerator(d));

    // 5. Color scale
    const colors = d3.scaleOrdinal(d3.schemeTableau10);

    // 6. Draw one <path> per slice
    arcs.forEach((arc, idx) => {
      svg.append("path")
        .attr("d", arc)
        .attr("fill", colors(idx));
    });

    // 7. Build the legend under / next to the pie
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
