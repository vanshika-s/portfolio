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

  // ---------- D3 CIRCLE FOR PIE CHART SETUP (Step 1.3) ----------
  // Select the SVG we added in projects/index.html
  const svg = d3.select("#projects-pie-plot");

  if (!svg.empty()) {
    // Create an arc generator for a full circle of radius 50
    const arcGenerator = d3.arc()
      .innerRadius(0)
      .outerRadius(50);

    const arc = arcGenerator({
      startAngle: 0,
      endAngle: 2 * Math.PI,   // full circle in radians
    });

    // Append the path to the SVG
    svg.append("path")
      .attr("d", arc)
      .attr("fill", "red");
  }
}

main();