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

  // ---------- D3 STATIC PIE CHART (Step 1.4) ----------
  const svg = d3.select("#projects-pie-plot");

  if (!svg.empty()) {
    // Arc generator for slices (radius 50)
    const arcGenerator = d3.arc()
      .innerRadius(0)
      .outerRadius(50);

    // Our dummy data: 1/3 vs 2/3 of the circle
    const data = [1, 2];

    // Let D3 compute startAngle / endAngle for each slice
    const sliceGenerator = d3.pie();
    const arcData = sliceGenerator(data);          // [{startAngle, endAngle, ...}, ...]
    const arcs = arcData.map(d => arcGenerator(d)); // array of path strings

    // Colors for the slices
    const colors = ["gold", "purple"];

    // Add one <path> per slice
    arcs.forEach((arc, idx) => {
      svg.append("path")
        .attr("d", arc)
        .attr("fill", colors[idx % colors.length]);
    });
  }
}

main();
