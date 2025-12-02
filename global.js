console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

/*const navLinks = $$("nav a");
console.log(navLinks);

let currentLink = navLinks.find(
  (a) => a.host === location.host && a.pathname === location.pathname,
);

currentLink?.classList.add("current");

console.log("Current link:", currentLink); */

export async function fetchJSON(url) {
  try {
    // 1. Fetch the JSON file from the given URL
    const response = await fetch(url);
    console.log(response); // temporary: lets you inspect it in DevTools

    // 2. Make sure the response is OK (status 200–299)
    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.status} ${response.statusText}`);
    }

    // 3. Parse the JSON body
    const data = await response.json();

    // 4. Return the parsed data so other code can use it
    return data;
  } catch (error) {
    console.error("Error fetching or parsing JSON data:", error);
    // optional: return null or [] so callers don't explode
    return null;
  }
}

export function renderProjects(projects, containerElement, headingLevel = "h2") {
  // 1. Basic safety checks
  if (!containerElement) {
    console.error("renderProjects: containerElement is null/undefined.");
    return;
  }

  if (!Array.isArray(projects)) {
    console.error("renderProjects: projects is not an array:", projects);
    return;
  }

  // 2. Clear existing content so we don't duplicate
  containerElement.innerHTML = "";

  // 3. Pick a safe heading level (fallback to h2 if invalid)
  const validHeadings = ["h1", "h2", "h3", "h4", "h5", "h6"];
  const tag = validHeadings.includes(headingLevel) ? headingLevel : "h2";

  // 4. Handle empty project list nicely
  if (projects.length === 0) {
    const msg = document.createElement("p");
    msg.textContent = "No projects to show yet. Check back soon!";
    containerElement.appendChild(msg);
    return;
  }

  // 5. Create an <article> for each project
  for (let project of projects) {
    const article = document.createElement("article");

    // Fall back values in case some fields are missing
    const title = project.title || "Untitled project";
    const description = project.description || "";
    const year = project.year || "";
    const rawImage = project.image || "";
    const url = project.url || null;

    // Build a correct image URL
    let imageSrc = "";
    if (rawImage) {
      if (rawImage.startsWith("http")) {
        // already an absolute URL
        imageSrc = rawImage;
      } else {
        // relative path in our repo, e.g. "images/1.png"
        imageSrc = BASE_PATH + rawImage;
      }
    }

    // Build title HTML (linked if url exists)
    let titleHTML = title;
    if (url) {
      const href = url.startsWith("http") ? url : BASE_PATH + url;
      titleHTML = `<a href="${href}" target="_blank" rel="noopener noreferrer">${title}</a>`;
    }

    // Use innerHTML so we can dynamically set the heading tag
    article.innerHTML = `
      <${tag}>${titleHTML}</${tag}>
      ${imageSrc ? `<img src="${imageSrc}" alt="${title}">` : ""}
      <div class="project-text">
        <p>${description}</p>
        ${year ? `<p class="project-year">${year}</p>` : ""}
        ${url
          ? `<a class="project-link" href="${url.startsWith("http") ? url : BASE_PATH + url}" target="_blank" rel="noopener noreferrer">
               View project →
             </a>`
          : ""}
      </div>
    `;

    containerElement.appendChild(article);
  }
}

  // 2. Clear existing content so we don't duplicate
  containerElement.innerHTML = "";

  // 3. Pick a safe heading level (fallback to h2 if invalid)
  const validHeadings = ["h1", "h2", "h3", "h4", "h5", "h6"];
  const tag = validHeadings.includes(headingLevel) ? headingLevel : "h2";

  // 4. Handle empty project list nicely
  if (projects.length === 0) {
    const msg = document.createElement("p");
    msg.textContent = "No projects to show yet. Check back soon!";
    containerElement.appendChild(msg);
    return;
  }

  // 5. Create an <article> for each project
  for (let project of projects) {
    const article = document.createElement("article");

    // Fall back values in case some fields are missing
    const title = project.title || "Untitled project";
    const description = project.description || "";
    const year = project.year || "";          // NEW
    const rawImage = project.image || "";

    // Build a correct image URL
    let imageSrc = "";
    if (rawImage) {
      if (rawImage.startsWith("http")) {
        // already an absolute URL
        imageSrc = rawImage;
      } else {
        // relative path in our repo, e.g. "images/1.png"
        imageSrc = BASE_PATH + rawImage;
      }
    }

    // Use innerHTML so we can dynamically set the heading tag
    article.innerHTML = `
      <${tag}>${title}</${tag}>
      ${imageSrc ? `<img src="${imageSrc}" alt="${title}">` : ""}
      <div class="project-text">
        <p>${description}</p>
        ${year ? `<p class="project-year">${year}</p>` : ""}
      </div>
    `;

    containerElement.appendChild(article);
  }

let pages = [
  { url: "",          title: "Home" },
  { url: "projects/", title: "Projects" },
  { url: "contact/",  title: "Contact" },
  { url: "cv/",       title: "CV" },
  { url: "meta/",     title: "Meta" },   // 👈 new page
  { url: "https://github.com/vanshika-s", title: "Profile" },
];

const BASE_PATH =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "/"                // when running on local server (Live Server, etc.)
    : "/portfolio/";     // GitHub Pages repo name

// Create <nav> and add it to the top of <body>
let nav = document.createElement("nav");
document.body.prepend(nav);

// Build links from the pages array
for (let p of pages) {
  let url = p.url;
  let title = p.title;

  // Prefix internal (relative) URLs with BASE_PATH
  if (!url.startsWith("http")) {
    url = BASE_PATH + url;
  }

  // Create <a> element
  let a = document.createElement("a");
  a.href = url;
  a.textContent = title;
  nav.append(a);

  // --- highlight current page link ---
  const isCurrent =
    a.host === location.host && a.pathname === location.pathname;

  a.classList.toggle("current", isCurrent);

  // --- make external links open in new tab ---
  const isExternal = a.host !== location.host;

  if (isExternal) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
}

document.body.insertAdjacentHTML(
  "afterbegin",
  `
  <label class="color-scheme">
    Theme:
    <select id="color-scheme-select">
      <option value="light dark">Automatic</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>
`
);

const select = document.querySelector("#color-scheme-select");

function setColorScheme(colorScheme) {
  // update <html> inline style
  document.documentElement.style.setProperty("color-scheme", colorScheme);
  // update the <select> UI
  select.value = colorScheme;
}

if ("colorScheme" in localStorage) {
  setColorScheme(localStorage.colorScheme);
} else {
  // fallback: keep whatever CSS default you set (light dark)
  setColorScheme("light dark");
}

select.addEventListener("input", function (event) {
  const value = event.target.value;
  console.log("color scheme changed to", value);

  // apply it
  setColorScheme(value);

  // save preference
  localStorage.colorScheme = value;
});

export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}