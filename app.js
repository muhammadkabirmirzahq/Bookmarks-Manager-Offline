const STORAGE_KEY = "bookmark-manager-v1";
const DB_NAME = "bookmark-manager-v1-db";
const DB_VERSION = 1;
const MAX_FLAT_PREVIEW = 100;
const state = {
  bookmarks: [],
  search: "",
  categoryFilter: "",
  tagFilter: "",
  pendingImport: null,
  pendingCategoryDelete: null,
  pendingCleanup: null
};

const els = {
  form: document.getElementById("bookmarkForm"),
  formTitle: document.getElementById("formTitle"),
  bookmarkId: document.getElementById("bookmarkId"),
  title: document.getElementById("title"),
  url: document.getElementById("url"),
  category: document.getElementById("category"),
  tags: document.getElementById("tags"),
  saveBtn: document.getElementById("saveBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  search: document.getElementById("search"),
  categoryFilter: document.getElementById("categoryFilter"),
  tagFilter: document.getElementById("tagFilter"),
  categoryOptions: document.getElementById("categoryOptions"),
  categories: document.getElementById("categories"),
  stats: document.getElementById("stats"),
  exportHtmlBtn: document.getElementById("exportHtmlBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  cleanupBtn: document.getElementById("cleanupBtn"),
  deleteAllBtn: document.getElementById("deleteAllBtn"),
  importFile: document.getElementById("importFile"),
  backupStatus: document.getElementById("backupStatus"),
  tagSuggestions: document.getElementById("tagSuggestions"),
  importPreview: document.getElementById("importPreview"),
  previewSummary: document.getElementById("previewSummary"),
  previewTree: document.getElementById("previewTree"),
  previewFlat: document.getElementById("previewFlat"),
  previewBreakdown: document.getElementById("previewBreakdown"),
  replaceImportBtn: document.getElementById("replaceImportBtn"),
  mergeImportBtn: document.getElementById("mergeImportBtn"),
  cancelImportBtn: document.getElementById("cancelImportBtn"),
  categoryDeletePreview: document.getElementById("categoryDeletePreview"),
  categoryDeleteSummary: document.getElementById("categoryDeleteSummary"),
  categoryDeleteList: document.getElementById("categoryDeleteList"),
  confirmCategoryDeleteBtn: document.getElementById("confirmCategoryDeleteBtn"),
  cancelCategoryDeleteBtn: document.getElementById("cancelCategoryDeleteBtn"),
  cleanupPreview: document.getElementById("cleanupPreview"),
  duplicatePreview: document.getElementById("duplicatePreview"),
  categoryMergePreview: document.getElementById("categoryMergePreview"),
  junkCategoryPreview: document.getElementById("junkCategoryPreview"),
  urlNormalizePreview: document.getElementById("urlNormalizePreview"),
  applyUrlNormalizationBtn: document.getElementById("applyUrlNormalizationBtn"),
  cancelCleanupBtn: document.getElementById("cancelCleanupBtn")
};

function normalizeText(value) {
  return String(value || "").trim();
}

function parseTags(value) {
  let seen = Object.create(null);
  return String(value || "")
    .split(",")
    .map(function (tag) {
      return tag.trim().toLowerCase();
    })
    .filter(function (tag) {
      if (!tag || seen[tag]) return false;
      seen[tag] = true;
      return true;
    });
}

function suggestedTags(title, url) {
  let tags = [];
  try {
    let host = new URL(url).hostname.replace(/^www\./, "");
    let domain = host.split(".")[0];
    if (domain) tags.push(domain.toLowerCase());
  } catch (error) {
    // URL suggestions are optional and never block manual entry.
  }
  normalizeText(title).toLowerCase().split(/[^a-z0-9]+/).forEach(function (word) {
    if (word.length >= 4 && ["https", "http", "www", "with", "from", "this", "that"].indexOf(word) < 0) {
      tags.push(word);
    }
  });
  return parseTags(tags.join(",")).slice(0, 8);
}

function renderTagSuggestions() {
  let tags = suggestedTags(els.title.value, els.url.value);
  els.tagSuggestions.textContent = tags.length ? "Suggested tags: " + tags.join(", ") : "";
}

function normalizeCategory(value) {
  return normalizeText(value) || "Uncategorized";
}

function normalizeUrl(value) {
  const url = normalizeText(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch (error) {
    return "";
  }
}

function normalizeBookmark(item, fallbackCategory) {
  const tags = Array.isArray(item.tags) ? item.tags.join(",") : item.tags;
  const url = normalizeUrl(item.url);
  if (!url) return null;
  return {
    title: normalizeText(item.title) || url,
    url: url,
    category: normalizeCategory(item.category || fallbackCategory),
    tags: parseTags(tags)
  };
}

function normalizeImported(input) {
  let source = Array.isArray(input) ? input : input && input.bookmarks;
  if (!Array.isArray(source)) {
    throw new Error("JSON must contain a bookmarks array.");
  }
  return source.map(function (item) {
    return normalizeBookmark(item, "Imported");
  }).filter(Boolean);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char];
  });
}

function formatCount(count) {
  return count + " bookmark" + (count === 1 ? "" : "s");
}

function appendChildren(parent, children) {
  children.filter(Boolean).forEach(function (child) {
    parent.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  });
  return parent;
}

function createElement(tagName, options) {
  const element = document.createElement(tagName);
  const config = options || {};
  if (config.className) element.className = config.className;
  if (config.text !== undefined) element.textContent = config.text;
  if (config.attrs) {
    Object.keys(config.attrs).forEach(function (name) {
      element.setAttribute(name, config.attrs[name]);
    });
  }
  if (config.children) appendChildren(element, config.children);
  return element;
}

function createEmptyMessage(message) {
  return createElement("p", { className: "empty", text: message });
}

function debounce(callback, wait) {
  let timeoutId;
  return function () {
    const args = arguments;
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(function () {
      callback.apply(null, args);
    }, wait);
  };
}

function getCategories(bookmarks) {
  return Array.from(new Set(bookmarks.map(function (bookmark) {
    return normalizeCategory(bookmark.category);
  }))).sort(function (a, b) {
    return a.localeCompare(b);
  });
}

function getTags(bookmarks) {
  let tags = [];
  let seen = Object.create(null);
  bookmarks.forEach(function (bookmark) {
    bookmark.tags.forEach(function (tag) {
      if (!seen[tag]) {
        seen[tag] = true;
        tags.push(tag);
      }
    });
  });
  return tags.sort(function (a, b) {
    return a.localeCompare(b);
  });
}

function openDb() {
  return new Promise(function (resolve, reject) {
    let request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function () {
      let db = request.result;
      if (!db.objectStoreNames.contains("data")) {
        db.createObjectStore("data");
      }
      if (!db.objectStoreNames.contains("restorePoints")) {
        db.createObjectStore("restorePoints", { keyPath: "id" });
      }
    };
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error);
    };
  });
}

async function idbGet(storeName, key) {
  const db = await openDb();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error);
    };
    tx.oncomplete = function () {
      db.close();
    };
    tx.onerror = function () {
      db.close();
      reject(tx.error);
    };
  });
}

async function idbPut(storeName, value, key) {
  const db = await openDb();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = key === undefined ? store.put(value) : store.put(value, key);
    request.onerror = function () {
      reject(request.error);
    };
    tx.oncomplete = function () {
      db.close();
      resolve();
    };
    tx.onerror = function () {
      db.close();
      reject(tx.error);
    };
  });
}

async function createRestorePoint(reason, bookmarks) {
  await idbPut("restorePoints", {
    id: new Date().toISOString() + "-" + Math.random().toString(16).slice(2),
    createdAt: new Date().toISOString(),
    reason: reason,
    bookmarks: bookmarks.slice()
  });
}

async function saveActiveBookmarks(bookmarks) {
  await idbPut("data", {
    version: 1,
    updatedAt: new Date().toISOString(),
    bookmarks: bookmarks
  }, "bookmarks");
}

async function load() {
  try {
    const record = await idbGet("data", "bookmarks");
    if (record && Array.isArray(record.bookmarks)) {
      state.bookmarks = normalizeImported(record);
      setStatus("Stored safely in IndexedDB.");
      return;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    state.bookmarks = raw ? normalizeImported(JSON.parse(raw)) : [];
    if (state.bookmarks.length) {
      setStatus("Loaded legacy localStorage data read-only. First approved change will create an IndexedDB restore point.");
    }
  } catch (error) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state.bookmarks = raw ? normalizeImported(JSON.parse(raw)) : [];
      setStatus("IndexedDB unavailable. Loaded legacy localStorage data read-only.");
    } catch (fallbackError) {
      state.bookmarks = [];
      setStatus("Could not read saved data. Starting with an empty library.");
    }
  }
}

async function applyApprovedChange(reason, nextBookmarks) {
  const previous = state.bookmarks.slice();
  try {
    await createRestorePoint(reason, previous);
    await saveActiveBookmarks(nextBookmarks);
    state.bookmarks = nextBookmarks;
  } catch (error) {
    setStatus("Change was not saved: " + error.message);
    throw error;
  }
}

function setStatus(message) {
  els.backupStatus.textContent = message;
}

function makeTreeNode(name) {
  return {
    name: normalizeCategory(name),
    folders: [],
    bookmarks: []
  };
}

function directElement(node, tagName) {
  return Array.from(node.children).find(function (child) {
    return child.tagName === tagName;
  });
}

function nextDlAfter(node) {
  let next = node.nextElementSibling;
  return next && next.tagName === "DL" ? next : null;
}

function bookmarkFromAnchor(anchor, category) {
  return normalizeBookmark({
    title: anchor.textContent,
    url: anchor.getAttribute("href"),
    category: category,
    tags: []
  }, category);
}

function parseBookmarkHtml(text) {
  try {
    let doc = new DOMParser().parseFromString(text, "text/html");
    let rootList = doc.querySelector("dl");
    let root = makeTreeNode("Imported");
    let bookmarks = [];

    if (!rootList) {
      throw new Error("No DL root found.");
    }

    function walkDl(dl, category, treeNode) {
      Array.from(dl.children).forEach(function (node) {
        if (node.tagName !== "DT") return;

        let heading = directElement(node, "H3");
        let anchor = directElement(node, "A");
        let nestedList = directElement(node, "DL") || nextDlAfter(node);

        if (heading) {
          let folderName = normalizeCategory(heading.textContent);
          let folderNode = makeTreeNode(folderName);
          treeNode.folders.push(folderNode);
          if (nestedList) {
            walkDl(nestedList, folderName, folderNode);
          }
          return;
        }

        if (anchor) {
          let bookmark = bookmarkFromAnchor(anchor, category);
          if (bookmark) {
            bookmarks.push(bookmark);
            treeNode.bookmarks.push(bookmark);
          }
        }
      });
    }

    walkDl(rootList, "Imported", root);
    if (!bookmarks.length) {
      throw new Error("No bookmarks found in DL structure.");
    }
    return { bookmarks: bookmarks, tree: root, recovered: false };
  } catch (error) {
    return recoverBookmarkHtml(text);
  }
}

function recoverBookmarkHtml(text) {
  let doc = new DOMParser().parseFromString(text, "text/html");
  let root = makeTreeNode("Recovered / Unsorted");
  let bookmarks = Array.from(doc.querySelectorAll("a[href]")).map(function (anchor) {
    return bookmarkFromAnchor(anchor, "Recovered / Unsorted");
  }).filter(Boolean);

  if (!bookmarks.length) {
    throw new Error("No bookmark links found in this HTML file.");
  }

  root.bookmarks = bookmarks.slice();
  return { bookmarks: bookmarks, tree: root, recovered: true };
}

function filteredEntries() {
  let query = state.search.toLowerCase();
  return state.bookmarks.map(function (bookmark, index) {
    return { bookmark: bookmark, index: index };
  }).filter(function (entry) {
    let bookmark = entry.bookmark;
    let matchesCategory = !state.categoryFilter || bookmark.category === state.categoryFilter;
    let matchesTag = !state.tagFilter || bookmark.tags.indexOf(state.tagFilter) >= 0;
    if (!matchesCategory || !matchesTag) return false;
    if (!query) return true;

    let titleMatch = bookmark.title.toLowerCase().includes(query);
    let categoryMatch = bookmark.category.toLowerCase().includes(query);
    let tagMatch = bookmark.tags.some(function (tag) {
      return tag.includes(query);
    });
    return titleMatch || categoryMatch || tagMatch;
  });
}

function renderOptions() {
  const categories = getCategories(state.bookmarks);
  const tags = getTags(state.bookmarks);
  const selectedCategory = state.categoryFilter;
  const selectedTag = state.tagFilter;

  els.categoryOptions.replaceChildren.apply(
    els.categoryOptions,
    categories.map(function (category) {
      return createElement("option", { attrs: { value: category } });
    })
  );

  els.categoryFilter.replaceChildren.apply(els.categoryFilter, [
    createElement("option", { text: "All categories", attrs: { value: "" } })
  ].concat(categories.map(function (category) {
    return createElement("option", { text: category, attrs: { value: category } });
  })));
  els.categoryFilter.value = categories.indexOf(selectedCategory) >= 0 ? selectedCategory : "";
  state.categoryFilter = els.categoryFilter.value;

  els.tagFilter.replaceChildren.apply(els.tagFilter, [
    createElement("option", { text: "All tags", attrs: { value: "" } })
  ].concat(tags.map(function (tag) {
    return createElement("option", { text: tag, attrs: { value: tag } });
  })));
  els.tagFilter.value = tags.indexOf(selectedTag) >= 0 ? selectedTag : "";
  state.tagFilter = els.tagFilter.value;
}

function renderList() {
  const visible = filteredEntries();
  const grouped = new Map();

  visible.forEach(function (entry) {
    const category = normalizeCategory(entry.bookmark.category);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(entry);
  });

  const nodes = Array.from(grouped.keys()).sort(function (a, b) {
    return a.localeCompare(b);
  }).map(function (category) {
    return renderCategory(category, grouped.get(category));
  });

  els.stats.textContent = formatCount(visible.length) + " shown, " + formatCount(state.bookmarks.length) + " total";
  els.categories.replaceChildren.apply(els.categories, nodes.length ? nodes : [createEmptyMessage("No bookmarks found.")]);
}

function renderCategory(category, entries) {
  const summary = createElement("summary", {
    children: [
      category + " ",
      createElement("span", { className: "count", text: "(" + entries.length + ")" })
    ]
  });
  const deleteButton = createElement("button", {
    className: "danger",
    text: "Delete Category",
    attrs: {
      type: "button",
      "data-action": "preview-category-delete",
      "data-category": category,
      "aria-label": "Delete category " + category
    }
  });
  const actions = createElement("div", { className: "list-actions small", children: [deleteButton] });
  const list = createElement("ul", { className: "bookmark-list", children: entries.map(renderBookmark) });
  const details = createElement("details", { className: "category", children: [summary, actions, list] });
  details.open = true;
  return details;
}

function renderBookmark(entry) {
  const bookmark = entry.bookmark;
  const link = createElement("a", {
    className: "bookmark-url",
    text: bookmark.title,
    attrs: { href: bookmark.url, target: "_blank", rel: "noopener noreferrer" }
  });
  const title = createElement("div", { className: "bookmark-title", children: [link] });
  const tags = bookmark.tags.length ? createElement("div", {
    className: "tags",
    children: bookmark.tags.map(function (tag) {
      return createElement("span", { className: "tag", text: tag });
    })
  }) : null;
  const editButton = createElement("button", {
    text: "Edit",
    attrs: { type: "button", "data-action": "edit", "data-index": String(entry.index) }
  });
  const deleteButton = createElement("button", {
    className: "danger",
    text: "Delete",
    attrs: { type: "button", "data-action": "delete", "data-index": String(entry.index) }
  });
  const actions = createElement("div", { className: "list-actions small", children: [editButton, deleteButton] });
  return createElement("li", {
    className: "bookmark",
    attrs: { "data-index": String(entry.index) },
    children: [title, tags, actions]
  });
}

function render(dataChanged) {
  if (dataChanged) renderOptions();
  renderList();
}

function resetForm() {
  els.form.reset();
  els.bookmarkId.value = "";
  els.formTitle.textContent = "Add Bookmark";
  els.saveBtn.textContent = "Add Bookmark";
  els.cancelEditBtn.classList.add("hidden");
  renderTagSuggestions();
}

function editBookmark(index) {
  let bookmark = state.bookmarks[index];
  if (!bookmark) return;

  els.bookmarkId.value = String(index);
  els.title.value = bookmark.title;
  els.url.value = bookmark.url;
  els.category.value = bookmark.category;
  els.tags.value = bookmark.tags.join(", ");
  els.formTitle.textContent = "Edit Bookmark";
  els.saveBtn.textContent = "Save Changes";
  els.cancelEditBtn.classList.remove("hidden");
  renderTagSuggestions();
  els.title.focus();
}

async function deleteBookmark(index) {
  const bookmark = state.bookmarks[index];
  if (!bookmark) return;

  if (!confirm('Delete "' + bookmark.title + '"?')) return;
  const next = state.bookmarks.filter(function (_, itemIndex) {
    return itemIndex !== index;
  });
  try {
    await applyApprovedChange("Delete bookmark", next);
    resetForm();
    setStatus("Bookmark deleted. Restore point saved.");
    render(true);
  } catch (error) {
    console.error("Delete bookmark failed", error);
  }
}

async function deleteAllBookmarks() {
  if (!state.bookmarks.length) {
    setStatus("No bookmarks to delete.");
    return;
  }

  if (!confirm("Delete all bookmarks? This cannot be undone.")) return;
  try {
    await applyApprovedChange("Delete all bookmarks", []);
    resetForm();
    setStatus("All bookmarks deleted. Restore point saved.");
    render(true);
  } catch (error) {
    console.error("Delete all failed", error);
  }
}

async function upsertBookmark(event) {
  event.preventDefault();

  const index = els.bookmarkId.value === "" ? -1 : Number(els.bookmarkId.value);
  const bookmark = normalizeBookmark({
    title: els.title.value,
    url: els.url.value,
    category: els.category.value,
    tags: els.tags.value
  }, "Uncategorized");

  if (!bookmark) return;

  const next = state.bookmarks.slice();
  let reason;
  if (index >= 0 && next[index]) {
    next[index] = bookmark;
    reason = "Edit bookmark";
  } else {
    next.unshift(bookmark);
    reason = "Add bookmark";
  }

  try {
    await applyApprovedChange(reason, next);
    resetForm();
    setStatus((reason === "Edit bookmark" ? "Bookmark updated." : "Bookmark added.") + " Restore point saved.");
    render(true);
  } catch (error) {
    console.error("Save bookmark failed", error);
  }
}

function previewCategoryDelete(category) {
  let affected = state.bookmarks.filter(function (bookmark) {
    return bookmark.category === category;
  });
  state.pendingCategoryDelete = category;
  els.categoryDeleteSummary.textContent = 'Safe mode: "' + category + '" contains ' + formatCount(affected.length) + ". Nothing will be deleted unless you confirm.";
  els.categoryDeleteList.replaceChildren(renderFlatPreview(affected));
  els.categoryDeletePreview.classList.remove("hidden");
  els.categoryDeletePreview.focus();
  setStatus("Review category deletion preview before confirming.");
}

async function confirmCategoryDelete() {
  const category = state.pendingCategoryDelete;
  if (!category) return;
  const next = state.bookmarks.filter(function (bookmark) {
    return bookmark.category !== category;
  });
  try {
    await applyApprovedChange("Delete category " + category, next);
    state.pendingCategoryDelete = null;
    els.categoryDeletePreview.classList.add("hidden");
    resetForm();
    render(true);
    setStatus("Category deleted after confirmation. Restore point saved.");
  } catch (error) {
    console.error("Delete category failed", error);
  }
}

function cancelCategoryDelete() {
  state.pendingCategoryDelete = null;
  els.categoryDeletePreview.classList.add("hidden");
  setStatus("Category delete canceled.");
}

function handleListClick(event) {
  let button = event.target.closest("button[data-action]");
  if (!button) return;

  if (button.getAttribute("data-action") === "preview-category-delete") {
    previewCategoryDelete(button.getAttribute("data-category"));
    return;
  }

  let index = Number(button.getAttribute("data-index"));
  if (button.getAttribute("data-action") === "edit") {
    editBookmark(index);
  }
  if (button.getAttribute("data-action") === "delete") {
    deleteBookmark(index);
  }
}

function downloadText(filename, type, text) {
  let blob = new Blob([text], { type: type });
  let url = URL.createObjectURL(blob);
  let link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportJson() {
  downloadText(
    "bookmarks-v1-backup.json",
    "application/json",
    JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), bookmarks: state.bookmarks }, null, 2)
  );
  setStatus("JSON backup exported.");
}

function exportHtml() {
  downloadText("bookmarks.html", "text/html", buildBookmarkHtml(state.bookmarks));
  setStatus("Chrome/Edge HTML bookmarks exported.");
}

function buildBookmarkHtml(bookmarks) {
  let grouped = new Map();
  getCategories(bookmarks).forEach(function (category) {
    grouped.set(category, []);
  });
  bookmarks.forEach(function (bookmark) {
    let category = normalizeCategory(bookmark.category);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(bookmark);
  });

  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    Array.from(grouped.keys()).sort(function (a, b) {
      return a.localeCompare(b);
    }).map(function (category) {
      return [
        '  <DT><H3>' + escapeHtml(category) + '</H3>',
        '  <DL><p>',
        grouped.get(category).map(function (bookmark) {
          return '    <DT><A HREF="' + escapeHtml(bookmark.url) + '">' + escapeHtml(bookmark.title) + '</A>';
        }).join("\n"),
        '  </DL><p>'
      ].join("\n");
    }).join("\n"),
    '</DL><p>'
  ].join("\n");
}

async function importBackup(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const isHtml = /\.html?$/i.test(file.name) || /^\s*<!doctype html/i.test(text) || /<dl[\s>]/i.test(text) || /<a\s/i.test(text);
    const result = isHtml ? parseBookmarkHtml(text) : {
      bookmarks: normalizeImported(JSON.parse(text)),
      tree: makeTreeNode("JSON Import"),
      recovered: false
    };
    if (!isHtml) {
      result.tree.bookmarks = result.bookmarks.slice(0, MAX_FLAT_PREVIEW);
    }
    showImportPreview(result, file.name, isHtml ? "HTML" : "JSON");
  } catch (error) {
    console.error("Import failed", error);
    setStatus("Import failed: " + error.message);
  } finally {
    els.importFile.value = "";
  }
}

function showImportPreview(result, fileName, type) {
  state.pendingImport = result.bookmarks;
  const seenImportUrls = new Set();
  const duplicateImportCount = result.bookmarks.reduce(function (count, bookmark) {
    const key = bookmark.url.toLowerCase();
    if (seenImportUrls.has(key)) return count + 1;
    seenImportUrls.add(key);
    return count;
  }, 0);
  const existingUrls = new Set(state.bookmarks.map(function (bookmark) {
    return bookmark.url.toLowerCase();
  }));
  const existingOverlapCount = result.bookmarks.filter(function (bookmark) {
    return existingUrls.has(bookmark.url.toLowerCase());
  }).length;
  const diagnostics = [];
  if (result.recovered) diagnostics.push("recovered into Recovered / Unsorted");
  if (duplicateImportCount) diagnostics.push(duplicateImportCount + " duplicate URLs inside the import");
  if (existingOverlapCount) diagnostics.push(existingOverlapCount + " URLs already in your library");
  els.previewSummary.textContent = type + " import from " + fileName + ": " + formatCount(result.bookmarks.length) + (diagnostics.length ? " (" + diagnostics.join("; ") + ")." : ".");
  els.previewTree.replaceChildren(renderPreviewTree(result.tree));
  els.previewFlat.replaceChildren(renderFlatPreview(result.bookmarks));
  els.previewBreakdown.replaceChildren(renderBreakdown(result.bookmarks));
  els.importPreview.classList.remove("hidden");
  els.importPreview.focus();
  setStatus("Review the import preview before saving.");
}

function renderPreviewTree(node) {
  const rootItem = createElement("li", { children: [createElement("strong", { text: node.name })] });
  const nested = [];
  node.folders.forEach(function (folder) {
    const folderItem = createElement("li", {
      children: [createElement("strong", { text: folder.name }), renderPreviewTree(folder)]
    });
    nested.push(folderItem);
  });
  node.bookmarks.slice(0, 25).forEach(function (bookmark) {
    nested.push(createElement("li", {
      children: [createElement("a", {
        text: bookmark.title,
        attrs: { href: bookmark.url, target: "_blank", rel: "noopener noreferrer" }
      })]
    }));
  });
  if (node.bookmarks.length > 25) {
    nested.push(createElement("li", {
      className: "meta",
      text: "+" + (node.bookmarks.length - 25) + " more in this folder"
    }));
  }
  if (nested.length) {
    rootItem.appendChild(createElement("ul", { children: nested }));
  }
  return createElement("ul", { children: [rootItem] });
}

function renderFlatPreview(bookmarks) {
  const items = bookmarks.slice(0, MAX_FLAT_PREVIEW).map(function (bookmark) {
    return createElement("li", {
      children: [
        createElement("a", {
          text: bookmark.title,
          attrs: { href: bookmark.url, target: "_blank", rel: "noopener noreferrer" }
        }),
        " ",
        createElement("span", { className: "meta", text: "(" + bookmark.category + ")" })
      ]
    });
  });
  if (bookmarks.length > MAX_FLAT_PREVIEW) {
    items.push(createElement("li", {
      className: "meta",
      text: "+" + (bookmarks.length - MAX_FLAT_PREVIEW) + " more bookmarks"
    }));
  }
  return createElement("ul", { children: items });
}

function renderBreakdown(bookmarks) {
  const counts = new Map();
  bookmarks.forEach(function (bookmark) {
    const category = normalizeCategory(bookmark.category);
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return createElement("ul", { children: Array.from(counts.keys()).sort(function (a, b) {
    return a.localeCompare(b);
  }).map(function (category) {
    return createElement("li", { text: category + ": " + counts.get(category) });
  }) });
}

async function commitImport(mode) {
  if (!state.pendingImport) return;
  const next = mode === "replace" ? state.pendingImport.slice() : mergeBookmarks(state.bookmarks, state.pendingImport);
  try {
    await applyApprovedChange(mode === "replace" ? "Replace library from import" : "Merge import into library", next);
    state.pendingImport = null;
    els.importPreview.classList.add("hidden");
    resetForm();
    render(true);
    setStatus("Import saved. Restore point saved.");
  } catch (error) {
    console.error("Commit import failed", error);
  }
}

function cancelImport() {
  state.pendingImport = null;
  els.importPreview.classList.add("hidden");
  setStatus("Import canceled.");
}

function cleanupKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizedUrlSuggestion(url) {
  try {
    let parsed = new URL(url);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "fbclid", "gclid", "mc_cid", "mc_eid"].forEach(function (param) {
      parsed.searchParams.delete(param);
    });
    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
      parsed.port = "";
    }
    return parsed.toString();
  } catch (error) {
    return url;
  }
}

function findDuplicates() {
  let groups = new Map();
  state.bookmarks.forEach(function (bookmark, index) {
    let key = bookmark.url;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ bookmark: bookmark, index: index });
  });
  return Array.from(groups.values()).filter(function (group) {
    return group.length > 1;
  });
}

function findCategoryMergeSuggestions() {
  let byKey = new Map();
  getCategories(state.bookmarks).forEach(function (category) {
    let key = cleanupKey(category);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(category);
  });
  return Array.from(byKey.values()).filter(function (group) {
    return group.length > 1;
  });
}

function findReviewCategories() {
  let reviewNames = ["newfolder", "search", "anything", "myfolder", "bookmarksbar", "otherbookmarks", "imported"];
  return getCategories(state.bookmarks).filter(function (category) {
    return reviewNames.indexOf(cleanupKey(category)) >= 0;
  });
}

function findUrlNormalizationSuggestions() {
  return state.bookmarks.map(function (bookmark, index) {
    return { index: index, bookmark: bookmark, suggestedUrl: normalizedUrlSuggestion(bookmark.url) };
  }).filter(function (item) {
    return item.suggestedUrl !== item.bookmark.url;
  });
}

function renderCleanupPreview() {
  const duplicates = findDuplicates();
  const mergeSuggestions = findCategoryMergeSuggestions();
  const reviewCategories = findReviewCategories();
  const urlSuggestions = findUrlNormalizationSuggestions();
  state.pendingCleanup = { urlSuggestions: urlSuggestions };

  els.duplicatePreview.replaceChildren(duplicates.length ? createElement("ul", {
    children: duplicates.slice(0, 50).map(function (group) {
      return createElement("li", {
        children: [
          group[0].bookmark.url + " ",
          createElement("span", { className: "meta", text: "(" + group.length + " copies)" })
        ]
      });
    })
  }) : createEmptyMessage("No identical URL duplicates found."));

  els.categoryMergePreview.replaceChildren(mergeSuggestions.length ? createElement("ul", {
    children: mergeSuggestions.map(function (group) {
      return createElement("li", { text: group.join(" / ") });
    })
  }) : createEmptyMessage("No similar category names found."));

  els.junkCategoryPreview.replaceChildren(reviewCategories.length ? createElement("ul", {
    children: reviewCategories.map(function (category) {
      return createElement("li", {
        children: [
          category + " ",
          createElement("span", { className: "meta", text: "review suggested only" })
        ]
      });
    })
  }) : createEmptyMessage("No review-suggested category names found."));

  const urlSuggestionItems = urlSuggestions.slice(0, 100).map(function (item) {
    return createElement("li", {
      children: [
        createElement("span", { className: "meta", text: item.bookmark.url }),
        createElement("br"),
        item.suggestedUrl
      ]
    });
  });
  if (urlSuggestions.length > 100) {
    urlSuggestionItems.push(createElement("li", {
      className: "meta",
      text: "+" + (urlSuggestions.length - 100) + " more URL suggestions"
    }));
  }
  els.urlNormalizePreview.replaceChildren(urlSuggestions.length ? createElement("ul", {
    children: urlSuggestionItems
  }) : createEmptyMessage("No URL normalization suggestions found."));

  els.applyUrlNormalizationBtn.disabled = urlSuggestions.length === 0;
  els.cleanupPreview.classList.remove("hidden");
  els.cleanupPreview.focus();
  setStatus("Cleanup preview ready. Suggestions only.");
}

async function applyUrlNormalization() {
  if (!state.pendingCleanup || !state.pendingCleanup.urlSuggestions.length) return;
  if (!confirm("Apply URL normalization suggestions? A restore point will be saved first.")) return;
  const next = state.bookmarks.map(function (bookmark) {
    const normalized = normalizedUrlSuggestion(bookmark.url);
    return normalized === bookmark.url ? bookmark : {
      title: bookmark.title,
      url: normalized,
      category: bookmark.category,
      tags: bookmark.tags.slice()
    };
  });
  try {
    await applyApprovedChange("Apply URL normalization suggestions", next);
    render(true);
    renderCleanupPreview();
    setStatus("URL normalization applied after confirmation. Restore point saved.");
  } catch (error) {
    console.error("URL normalization failed", error);
  }
}

function mergeBookmarks(current, imported) {
  let byUrl = Object.create(null);
  current.concat(imported).forEach(function (bookmark) {
    byUrl[bookmark.url.toLowerCase()] = bookmark;
  });
  return Object.keys(byUrl).map(function (key) {
    return byUrl[key];
  });
}

const debouncedRenderTagSuggestions = debounce(renderTagSuggestions, 150);
const debouncedSearch = debounce(function () {
  state.search = els.search.value.trim();
  render(false);
}, 200);

els.form.addEventListener("submit", upsertBookmark);
els.title.addEventListener("input", debouncedRenderTagSuggestions);
els.url.addEventListener("input", debouncedRenderTagSuggestions);
els.cancelEditBtn.addEventListener("click", resetForm);
els.categories.addEventListener("click", handleListClick);
els.search.addEventListener("input", debouncedSearch);
els.categoryFilter.addEventListener("change", function () {
  state.categoryFilter = els.categoryFilter.value;
  render(false);
});
els.tagFilter.addEventListener("change", function () {
  state.tagFilter = els.tagFilter.value;
  render(false);
});
els.exportHtmlBtn.addEventListener("click", exportHtml);
els.exportJsonBtn.addEventListener("click", exportJson);
els.cleanupBtn.addEventListener("click", renderCleanupPreview);
els.deleteAllBtn.addEventListener("click", deleteAllBookmarks);
els.importFile.addEventListener("change", function () {
  importBackup(els.importFile.files[0]);
});
els.replaceImportBtn.addEventListener("click", function () {
  commitImport("replace");
});
els.mergeImportBtn.addEventListener("click", function () {
  commitImport("merge");
});
els.cancelImportBtn.addEventListener("click", cancelImport);
els.confirmCategoryDeleteBtn.addEventListener("click", confirmCategoryDelete);
els.cancelCategoryDeleteBtn.addEventListener("click", cancelCategoryDelete);
els.applyUrlNormalizationBtn.addEventListener("click", applyUrlNormalization);
els.cancelCleanupBtn.addEventListener("click", function () {
  state.pendingCleanup = null;
  els.cleanupPreview.classList.add("hidden");
  setStatus("Cleanup preview closed.");
});

await load();
render(true);
renderTagSuggestions();


