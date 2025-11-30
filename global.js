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

let pages = [
  { url: "",          title: "Home" },
  { url: "projects/", title: "Projects" },
  { url: "contact/",  title: "Contact" },
  { url: "cv/",       title: "CV" },
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
