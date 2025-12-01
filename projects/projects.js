import { fetchJSON, renderProjects } from "../global.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

let allProjects = [];
let query = "";

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

  // Save full list so search can reuse it
  allProjects = projects;

  // 4. Update the title with the number of projects
  const titleEl = document.querySelector(".projects-title");
  if (titleEl) {
    const count = projects.length;
    titleEl.textContent = `Projects (${count})`;
  }

  // --- helper: render list + pie chart for a given set of projects ---
  function updateView(projectList) {
    // 1) Render project cards
    renderProjects(projectList, projectsContainer, "h2");

    // 2) Rebuild pie chart + legend based on *visible* projects
    const svg = d3.select("#projects-pie-plot");
    const legend = d3.select(".legend");

    if (svg.empty()) return;

    // Clear previous chart + legend so we don't stack them
    svg.selectAll("*").remove();
    legend.selectAll("*").remove();

    // If nothing matches the filter, show a message + bail out
    if (!projectList || projectList.length === 0) {
      legend.append("li").text("No projects match this search yet.");
      return;
    }

    // Group by year and count
    const rolledData = d3.rollups(
      projectList,
      (v) => v.length,   // number of projects in that year
      (d) => d.year      // group key = project.year
    );

    // sort years (optional but nice)
    rolledData.sort((a, b) => Number(a[0]) - Number(b[0]));

    // Convert to { value, label } format for the chart
    const data = rolledData.map(([year, count]) => ({
      value: count,
      label: year,
    }));

    // Arc generator
    const arcGenerator = d3.arc()
      .innerRadius(0)
      .outerRadius(50);

    // Pie layout (based on value)
    const sliceGenerator = d3.pie().value((d) => d.value);
    const arcData = sliceGenerator(data);
    const arcs = arcData.map((d) => arcGenerator(d));

    // Color scale
    const colors = d3.scaleOrdinal(d3.schemeTableau10);

    // Draw slices
    arcs.forEach((arc, idx) => {
      svg.append("path")
        .attr("d", arc)
        .attr("fill", colors(idx));
    });

    // Build legend
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

  // 5. Initial render with ALL projects
  updateView(allProjects);

  // 6. Search input → filter + re-render
  const searchInput = document.querySelector(".searchBar");
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      query = event.target.value.toLowerCase();

      const filtered = allProjects.filter((project) => {
        // grab ALL values of the project object
        const values = Object.values(project)
          .join("\n")         // combine into one big string
          .toLowerCase();     // make search case-insensitive

        return values.includes(query);
      });

      updateView(filtered);   // re-render list + pie chart
    });
  }
}

main();

