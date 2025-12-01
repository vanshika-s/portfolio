import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

async function loadData() {
  const data = await d3.csv("loc.csv", (row) => ({
    ...row,
    line: Number(row.line),          // numeric
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + "T00:00" + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

// top-level await is allowed because this file is loaded as a module
const data = await loadData();

// temporary sanity check (you can remove later if you want)
console.log("LOC data rows:", data.length);

// you'll use `data` in the next steps to compute and show stats in #stats