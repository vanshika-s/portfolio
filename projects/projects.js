import { fetchJSON, renderProjects } from "../global.js";

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

  // 🔹 4. Update the title with the number of projects
  const titleEl = document.querySelector(".projects-title");
  if (titleEl) {
    const count = projects.length;
    titleEl.textContent = `Projects (${count})`;
    // or: titleEl.textContent = `Projects – ${count} total`;
  }

  // 5. Render the projects into the container
  renderProjects(projects, projectsContainer, "h2");
}

main();