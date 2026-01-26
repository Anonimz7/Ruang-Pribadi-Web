const sourceConfig = [
  { id: "kontan", label: "Kontan" },
  { id: "reuters", label: "Reuters" },
  { id: "blomberg", label: "Bloomberg" },
];

const state = {
  data: [],
  filtered: [],
  activeSources: new Set(sourceConfig.map((source) => source.id)),
  fetchErrors: [],
  pagination: {
    page: 1,
    pageSize: 9,
  },
};

const elements = {
  searchInput: document.getElementById("searchInput"),
  categorySelect: document.getElementById("categorySelect"),
  sortSelect: document.getElementById("sortSelect"),
  sourceTags: document.getElementById("sourceTags"),
  cards: document.getElementById("cards"),
  pagination: document.getElementById("pagination"),
  stats: document.getElementById("stats"),
  footer: document.getElementById("footer"),
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const buildSourceTags = () => {
  elements.sourceTags.innerHTML = "";
  sourceConfig.forEach((source) => {
    const tag = document.createElement("label");
    tag.className = "tag active";
    tag.innerHTML = `<input type="checkbox" checked value="${source.id}" /> <span>${source.label}</span>`;
    tag.addEventListener("click", () => {
      const input = tag.querySelector("input");
      input.checked = !input.checked;
      if (input.checked) {
        state.activeSources.add(source.id);
        tag.classList.add("active");
      } else {
        state.activeSources.delete(source.id);
        tag.classList.remove("active");
      }
      applyFilters();
    });
    elements.sourceTags.appendChild(tag);
  });
};

const updateCategoryOptions = () => {
  const categories = Array.from(
    new Set(state.data.map((item) => item.category).filter(Boolean))
  ).sort();
  elements.categorySelect.innerHTML = "<option value=\"\">Semua kategori</option>";
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    elements.categorySelect.appendChild(option);
  });
};

const updateStats = () => {
  const total = state.data.length;
  const filtered = state.filtered.length;
  const newest = state.filtered[0];
  const newestDate = newest ? formatDate(newest.published_date) : "-";
  elements.stats.innerHTML = `
        <span>Total data: <strong>${total}</strong></span>
        <span>Hasil tampil: <strong>${filtered}</strong></span>
        <span>Update terakhir: <strong>${newestDate}</strong></span>
      `;
};

const calculatePageSize = () => {
  const cardHeight = 230;
  const availableHeight = Math.max(420, window.innerHeight - 420);
  const rows = Math.max(2, Math.floor(availableHeight / cardHeight));
  const width = window.innerWidth;
  const columns = width >= 1100 ? 3 : width >= 760 ? 2 : 1;
  const size = rows * columns;
  return Math.min(18, Math.max(6, size));
};

const getPaginationMeta = () => {
  const totalItems = state.filtered.length;
  const pageSize = state.pagination.pageSize;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(state.pagination.page, totalPages);
  return { totalItems, pageSize, totalPages, page };
};

const renderPagination = () => {
  const { totalItems, page, totalPages } = getPaginationMeta();
  if (totalItems === 0) {
    elements.pagination.innerHTML = "";
    return;
  }

  elements.pagination.innerHTML = `
      <button type="button" data-page="prev" ${page === 1 ? "disabled" : ""}>Sebelumnya</button>
      <span class="page-info">Halaman ${page} dari ${totalPages}</span>
      <button type="button" data-page="next" ${page === totalPages ? "disabled" : ""}>Berikutnya</button>
    `;

  elements.pagination.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.dataset.page;
      if (direction === "prev") {
        state.pagination.page = Math.max(1, page - 1);
      } else {
        state.pagination.page = Math.min(totalPages, page + 1);
      }
      renderCards();
      renderPagination();
    });
  });
};

const renderCards = () => {
  if (!state.filtered.length) {
    elements.cards.innerHTML = `
          <div class="empty">
            <h3>Tidak ada data</h3>
            <p>Coba ubah kata kunci atau pilih sumber lainnya.</p>
          </div>
        `;
    elements.pagination.innerHTML = "";
    return;
  }

  const { page, pageSize } = getPaginationMeta();
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  elements.cards.innerHTML = state.filtered
    .slice(startIndex, endIndex)
    .map((item) => {
      const keywords = item.keywords
        ? item.keywords.split(",").slice(0, 3).map((keyword) => keyword.trim())
        : [];
      return `
            <article class="card">
              <div class="pill">${item.sourceLabel}</div>
              <a href="${item.link}" target="_blank" rel="noopener noreferrer">
                <h3>${item.title}</h3>
              </a>
              <div class="meta">
                <span>${item.category}</span>
                <span>•</span>
                <span>${formatDate(item.published_date)}</span>
              </div>
              <div class="meta">
                ${(keywords.length ? keywords : ["Tanpa keyword"])
                  .map((keyword) => `<span class="pill">${keyword}</span>`)
                  .join("")}
              </div>
            </article>
          `;
    })
    .join("");
};

const applyFilters = () => {
  const searchValue = elements.searchInput.value.toLowerCase();
  const categoryValue = elements.categorySelect.value;
  const sortValue = elements.sortSelect.value;

  state.pagination.page = 1;

  state.filtered = state.data
    .filter((item) => state.activeSources.has(item.source))
    .filter((item) => (categoryValue ? item.category === categoryValue : true))
    .filter((item) => {
      if (!searchValue) return true;
      return [item.title, item.category, item.keywords]
        .join(" ")
        .toLowerCase()
        .includes(searchValue);
    })
    .sort((a, b) => {
      if (sortValue === "title") return a.title.localeCompare(b.title);
      const timeA = new Date(a.published_date).getTime();
      const timeB = new Date(b.published_date).getTime();
      if (sortValue === "oldest") return timeA - timeB;
      return timeB - timeA;
    });

  renderCards();
  renderPagination();
  updateStats();
};

const buildBaseUrl = () => {
  const { origin, pathname } = window.location;
  if (!origin || origin === "null") {
    return window.location.href;
  }
  if (pathname.endsWith("/")) {
    return `${origin}${pathname}`;
  }
  const hasExtension = pathname.split("/").pop().includes(".");
  const basePath = hasExtension
    ? pathname.replace(/\/[^/]*$/, "/")
    : `${pathname}/`;
  return `${origin}${basePath}`;
};

const fetchDatabaseBuffer = async () => {
  const baseUrl = new URL(buildBaseUrl());
  const candidates = [
    new URL("data/data.db", baseUrl).toString(),
    "data/data.db",
    "./data/data.db",
  ];
  const errors = [];

  for (const path of candidates) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Gagal memuat database (${response.status}) dari ${path}`);
      }
      state.fetchErrors = [];
      return await response.arrayBuffer();
    } catch (error) {
      errors.push({ path, message: error?.message || "Tidak diketahui" });
    }
  }

  state.fetchErrors = errors;
  const summary = errors.map((item) => `${item.path}: ${item.message}`).join(" | ");
  throw new Error(summary || "Gagal memuat database");
};

const renderDatabaseError = (error) => {
  const protocol = window.location.protocol;
  const hint =
    protocol === "file:"
      ? "Buka halaman ini lewat server lokal (mis. `python -m http.server`) agar browser mengizinkan akses file."
      : "Pastikan URL situs berakhiran `/` jika di-host di GitHub Pages atau gunakan path `/index.html`.";
  const fetchList = state.fetchErrors
    .map((item) => `<li><strong>${item.path}</strong><br /><span class="muted">${item.message}</span></li>`)
    .join("");
  const fetchDetails = fetchList
    ? `<p>URL yang dicoba:</p><ul class="fetch-list">${fetchList}</ul>`
    : "";
  elements.cards.innerHTML = `
    <div class="empty">
      <h3>Data tidak tersedia</h3>
      <p>Pastikan file <strong>data/data.db</strong> tersedia di folder yang sama dengan halaman ini (penting untuk GitHub Pages).</p>
      <p>Lokasi default yang dicari: <strong>data/data.db</strong> (relatif terhadap URL halaman).</p>
      <p>${hint}</p>
      ${fetchDetails}
      <p class="muted">Detail error: ${error?.message || "Tidak diketahui"}</p>
    </div>
  `;
  elements.footer.textContent = "Tidak dapat memuat data.";
};

const loadSqlJs = () =>
  new Promise((resolve, reject) => {
    if (window.initSqlJs) {
      resolve(window.initSqlJs);
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js";
    script.async = true;
    script.onload = () => {
      if (window.initSqlJs) {
        resolve(window.initSqlJs);
      } else {
        reject(new Error("initSqlJs tidak tersedia setelah memuat sql.js"));
      }
    };
    script.onerror = () => {
      reject(
        new Error(
          "Gagal memuat sql.js dari CDN. Pastikan koneksi internet tersedia."
        )
      );
    };
    document.head.appendChild(script);
  });

const loadDatabase = async () => {
  elements.footer.textContent = "Memuat data...";
  try {
    const buffer = await fetchDatabaseBuffer();
    const initSql = await loadSqlJs();
    const SQL = await initSql({
      locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`,
    });
    const db = new SQL.Database(new Uint8Array(buffer));
    const rows = [];

    sourceConfig.forEach((source) => {
      const result = db.exec(`SELECT * FROM ${source.id}`);
      if (!result.length) return;
      const columns = result[0].columns;
      result[0].values.forEach((values) => {
        const row = Object.fromEntries(values.map((value, index) => [columns[index], value]));
        rows.push({
          ...row,
          source: source.id,
          sourceLabel: source.label,
        });
      });
    });

    state.data = rows
      .filter((row) => row.title)
      .sort((a, b) => new Date(b.published_date) - new Date(a.published_date));

    updateCategoryOptions();
    applyFilters();
    elements.footer.textContent = "Data diambil dari data.db";
  } catch (error) {
    renderDatabaseError(error);
    console.error(error);
  }
};

buildSourceTags();
state.pagination.pageSize = calculatePageSize();
elements.searchInput.addEventListener("input", applyFilters);
elements.categorySelect.addEventListener("change", applyFilters);
elements.sortSelect.addEventListener("change", applyFilters);
window.addEventListener("resize", () => {
  const nextSize = calculatePageSize();
  if (nextSize !== state.pagination.pageSize) {
    state.pagination.pageSize = nextSize;
    state.pagination.page = 1;
    renderCards();
    renderPagination();
  }
});

loadDatabase();
