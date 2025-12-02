// global.js
console.log("global.js loaded");

// ---------- helpers ----------
export function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

// ---------- paths & nav ----------

// GitHub Pages base path vs local dev
export const BASE_PATH =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "/"              // local dev
    : "/portfolio/";   // <- your GitHub Pages repo name

// Pages for the top nav
const pages = [
  { url: "",          title: "Home" },
  { url: "projects/", title: "Projects" },
  { url: "contact/",  title: "Contact" },
  { url: "cv/",       title: "CV" },
  { url: "meta/",     title: "Meta" },
  { url: "https://github.com/vanshika-s", title: "Profile" },
];

// Build <nav> and insert at top of <body>
const nav = document.createElement("nav");
document.body.prepend(nav);

for (const p of pages) {
  let href = p.url;

  // prefix internal links
  if (!href.startsWith("http")) {
    href = BASE_PATH + href;
  }

  const a = document.createElement("a");
  a.href = href;
  a.textContent = p.title;
  nav.append(a);

  // highlight current page
  const isCurrent = a.host === location.host && a.pathname === location.pathname;
  a.classList.toggle("current", isCurrent);

  // external links -> new tab
  if (a.host !== location.host) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
}

// ---------- fetch helper ----------

export async function fetchJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (err) {
    console.error("fetchJSON error for", url, err);
    return null;
  }
}

// ---------- project card renderer ----------

export function renderProjects(projects, containerElement, headingLevel = "h2") {
  if (!containerElement) {
    console.error("renderProjects: containerElement is missing");
    return;
  }
  if (!Array.isArray(projects)) {
    console.error("renderProjects: projects is not an array", projects);
    return;
  }

  containerElement.innerHTML = "";

  const validHeadings = ["h1", "h2", "h3", "h4", "h5", "h6"];
  const tag = validHeadings.includes(headingLevel) ? headingLevel : "h2";

  if (projects.length === 0) {
    const msg = document.createElement("p");
    msg.textContent = "No projects to show yet. Check back soon!";
    containerElement.appendChild(msg);
    return;
  }

  for (const project of projects) {
    const article = document.createElement("article");

    const title = project.title || "Untitled project";
    const description = project.description || "";
    const year = project.year || "";
    const rawImage = project.image || "";
    const url = project.url || "";

    // build image src (absolute vs relative)
    let imageSrc = "";
    if (rawImage) {
      imageSrc = rawImage.startsWith("http")
        ? rawImage
        : BASE_PATH + rawImage;
    }

    const linkStart = url
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">`
      : "";
    const linkEnd = url ? "</a>" : "";

    article.innerHTML = `
      ${linkStart}<${tag}>${title}</${tag}>${linkEnd}
      ${imageSrc ? `${linkStart}<img src="${imageSrc}" alt="${title}">${linkEnd}` : ""}
      <div class="project-text">
        <p>${description}</p>
        ${year ? `<p class="project-year">${year}</p>` : ""}
      </div>
    `;

    containerElement.appendChild(article);
  }
}

// ---------- theme toggle ----------

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
  document.documentElement.style.setProperty("color-scheme", colorScheme);
  select.value = colorScheme;
}

if ("colorScheme" in localStorage) {
  setColorScheme(localStorage.colorScheme);
} else {
  setColorScheme("light dark");
}

select.addEventListener("input", (event) => {
  const value = event.target.value;
  setColorScheme(value);
  localStorage.colorScheme = value;
});

// ---------- GitHub helper (home page uses this) ----------

export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}
