(() => {
  const pageSize = 40;
  const number = new Intl.NumberFormat();
  const average = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const search = document.querySelector("#leaderboard-search");
  const count = document.querySelector("#leaderboard-count");
  const rows = document.querySelector("#leaderboard-rows");
  const pageList = document.querySelector("#leaderboard-pages");
  const pageInput = document.querySelector("#leaderboard-page-input");
  const error = document.querySelector("#leaderboard-error");
  const sortHeaders = Array.from(document.querySelectorAll(".leaderboard-table th[data-sort]"));
  let authors = [];
  let loaded = false;
  let currentPage = 1;
  let sortField = "total";
  let sortDirection = -1;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function groupPluginReleases(releases) {
    const projects = new Map();
    for (const release of releases) {
      const fallbackName = String(release.project_name || release.name || "").trim().toLocaleLowerCase();
      const fallbackRepo = String(release.repo_id || release.repo_name || "").toLocaleLowerCase();
      const key = release.project_id !== null && release.project_id !== undefined
        ? `project:${release.project_id}`
        : `fallback:${fallbackRepo}:${fallbackName}`;
      if (!projects.has(key)) projects.set(key, []);
      projects.get(key).push(release);
    }

    return Array.from(projects.values(), (projectReleases) => {
      projectReleases.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      const ownerMatch = /^([^/]+)\/[^/]+$/.exec(String(projectReleases[0].repo_name || "").trim());
      if (!ownerMatch) return null;
      return {
        owner: ownerMatch[1],
        downloads: projectReleases.reduce((total, release) => total + Number(release.downloads || 0), 0),
      };
    }).filter(Boolean);
  }

  function buildLeaderboard(projects) {
    const groups = new Map();
    for (const project of projects) {
      const key = project.owner.toLocaleLowerCase();
      if (!groups.has(key)) groups.set(key, { author: project.owner, plugins: 0, total: 0 });
      const author = groups.get(key);
      author.plugins += 1;
      author.total += project.downloads;
    }
    return Array.from(groups.values(), (author) => ({
      ...author,
      average: author.total / author.plugins,
    }));
  }

  function filteredAuthors() {
    const query = search.value.trim().toLocaleLowerCase();
    return authors
      .slice()
      .sort((a, b) => {
        const comparison = sortField === "author"
          ? collator.compare(a.author, b.author)
          : a[sortField] - b[sortField];
        return comparison * sortDirection;
      })
      .map((author, index) => ({ ...author, rank: index + 1 }))
      .filter((author) => !query || author.author.toLocaleLowerCase().includes(query));
  }

  function pageTokens(page, totalPages) {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const pages = new Set([1, totalPages, page - 1, page, page + 1]);
    const ordered = Array.from(pages).filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
    const tokens = [];
    for (let index = 0; index < ordered.length; index += 1) {
      if (index > 0 && ordered[index] - ordered[index - 1] > 1) tokens.push("...");
      tokens.push(ordered[index]);
    }
    return tokens;
  }

  function updateSortHeaders() {
    for (const header of sortHeaders) {
      const active = header.dataset.sort === sortField;
      header.setAttribute("aria-sort", active ? (sortDirection === 1 ? "ascending" : "descending") : "none");
      header.querySelector("button").setAttribute("aria-label", `${header.textContent.trim()}, sort ${active && sortDirection === 1 ? "descending" : "ascending"}`);
    }
  }

  function render() {
    if (!loaded) return;
    const filtered = filteredAuthors();
    const totalPages = Math.ceil(filtered.length / pageSize);
    currentPage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
    const firstIndex = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
    const visible = filtered.slice(firstIndex, firstIndex + pageSize);
    count.textContent = filtered.length === 0
      ? "No authors found"
      : `Showing ${number.format(firstIndex + 1)}-${number.format(firstIndex + visible.length)} of ${number.format(filtered.length)} authors`;

    rows.replaceChildren();
    if (visible.length === 0) {
      const row = element("tr");
      const cell = element("td", "leaderboard-empty", "No authors match this search");
      cell.colSpan = 5;
      row.append(cell);
      rows.append(row);
    } else {
      for (const author of visible) {
        const row = element("tr");
        const authorCell = element("th", "leaderboard-author", author.author);
        authorCell.scope = "row";
        row.append(
          element("td", "leaderboard-rank", number.format(author.rank)),
          authorCell,
          element("td", "leaderboard-number", number.format(author.plugins)),
          element("td", "leaderboard-number", number.format(author.total)),
          element("td", "leaderboard-number", average.format(author.average)),
        );
        rows.append(row);
      }
    }

    pageInput.disabled = totalPages <= 1;
    pageInput.max = String(Math.max(1, totalPages));
    pageInput.value = "";
    pageList.replaceChildren();
    if (totalPages > 1) {
      for (const token of pageTokens(currentPage, totalPages)) {
        if (token === "...") {
          pageList.append(element("span", "page-ellipsis", "..."));
          continue;
        }
        const button = element("button", `page-button${token === currentPage ? " is-current" : ""}`, String(token));
        button.type = "button";
        button.setAttribute("aria-label", `Page ${token}`);
        button.setAttribute("aria-current", token === currentPage ? "page" : "false");
        button.addEventListener("click", () => {
          currentPage = token;
          render();
        });
        pageList.append(button);
      }
    }
    updateSortHeaders();
  }

  async function init() {
    try {
      const pointerUrl = new URL("/data/api/v1/current.json", location.origin);
      const pointerResponse = await fetch(pointerUrl);
      if (!pointerResponse.ok) throw new Error(`Snapshot index returned ${pointerResponse.status}`);
      const pointer = await pointerResponse.json();
      const releasesUrl = new URL(pointer.files.releases, pointerUrl);
      const releasesResponse = await fetch(releasesUrl);
      if (!releasesResponse.ok) throw new Error(`Release data returned ${releasesResponse.status}`);
      const releases = await releasesResponse.json();
      authors = buildLeaderboard(groupPluginReleases(Array.isArray(releases) ? releases : []));
      loaded = true;
      rows.setAttribute("aria-busy", "false");
      render();
    } catch (cause) {
      error.textContent = `Could not load the saved leaderboard. ${cause.message}.`;
      error.classList.remove("hidden");
      count.textContent = "Leaderboard unavailable";
      rows.setAttribute("aria-busy", "false");
      rows.replaceChildren();
    }
  }

  search.addEventListener("input", () => {
    currentPage = 1;
    render();
  });

  for (const header of sortHeaders) {
    header.querySelector("button").addEventListener("click", () => {
      if (sortField === header.dataset.sort) {
        sortDirection *= -1;
      } else {
        sortField = header.dataset.sort;
        sortDirection = sortField === "author" ? 1 : -1;
      }
      currentPage = 1;
      render();
    });
  }

  pageInput.addEventListener("change", () => {
    const requestedPage = Number(pageInput.value);
    if (!Number.isInteger(requestedPage)) return;
    currentPage = requestedPage;
    render();
  });

  init();
})();
