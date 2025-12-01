import { fetchJSON, renderProjects, fetchGitHubData } from "./global.js";

async function main() {
  // ----- Latest Projects -----
  const projects = await fetchJSON("./lib/projects.json");

  if (!projects || !Array.isArray(projects)) {
    console.error("Could not load projects for homepage.");
    return;
  }

  const latestProjects = projects.slice(0, 3);

  const projectsContainer = document.querySelector(".projects");
  if (!projectsContainer) {
    console.error("No element with class 'projects' found on the home page.");
    return;
  }

  renderProjects(latestProjects, projectsContainer, "h2");

  // ----- GitHub profile stats -----
  const githubData = await fetchGitHubData("vanshika-s");
  console.log("GitHub data:", githubData);

  const profileStats = document.querySelector("#profile-stats");
  console.log("Profile stats element:", profileStats);

  if (profileStats && githubData) {
    profileStats.innerHTML = `
      <h3>My GitHub Stats</h3>
      <dl>
        <dt>Public Repos:</dt><dd>${githubData.public_repos}</dd>
        <dt>Public Gists:</dt><dd>${githubData.public_gists}</dd>
        <dt>Followers:</dt><dd>${githubData.followers}</dd>
        <dt>Following:</dt><dd>${githubData.following}</dd>
      </dl>
    `;
  }
}

main();