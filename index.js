import { fetchJSON, renderProjects, fetchGitHubData } from "./global.js";

async function main() {
  // 1. Load all projects
  const projects = await fetchJSON("./lib/projects.json");

  if (!projects || !Array.isArray(projects)) {
    console.error("Could not load projects for homepage.");
    return;
  }

  // 2. Take only the first 3
  const latestProjects = projects.slice(0, 3);

  // 3. Find the container on the homepage
  const projectsContainer = document.querySelector(".projects");

  if (!projectsContainer) {
    console.error("No element with class 'projects' found on the home page.");
    return;
  }

  // 4. Render the latest projects
  renderProjects(latestProjects, projectsContainer, "h2");

  // 5. Fetch GitHub data for YOUR username
  const githubData = await fetchGitHubData("vanshika-s");
  console.log("GitHub data:", githubData);

  const profileStats = document.querySelector('#profile-stats');
  console.log("Profile stats element:", profileStats);
}

main();