// @ts-nocheck
import { LOCALE, getString, fillI18nText } from './i18n';
import { escapeHTML, decodeHtmlEntities, sanitizeHtml, escapeRegExp, highlightHTML, highlightInElement } from './utils';

document.addEventListener('DOMContentLoaded', fillI18nText);

// —— 文本安全转义与高亮 ——
// utils imported above

// —— 全局 annotations 数组 ——
let annotations: any[] = [];
let textResults: any[] = [];
let bottomResults: any[] = [];
let combinedResults: any[] = [];

let currentPage = 1;
let totalPages = 1;

const textInput = document.getElementById("text-search") as any;
const commentInput = document.getElementById("comment-search") as any;
const itemsPerRowInput = document.getElementById("items-per-row") as any;
const itemsPerPageSelect = document.getElementById("items-per-page") as any;
const datePresetSelect = document.getElementById("date-preset") as any;
const collectionsTreeEl = document.getElementById("collections-tree") as any;
const collectionsTrigger = document.getElementById("collections-trigger") as any;
const collectionsPanel = document.getElementById("collections-panel") as any;
let selectedCollectionPaths = new Set<string>();
const tagOpSelect = document.getElementById("tag-op") as any;
const colorOpSelect = document.getElementById("color-op") as any;
const prevPageButton = document.getElementById("prev-page") as any;
const nextPageButton = document.getElementById("next-page") as any;
const pageInfoSpan = document.getElementById("page-info") as any;

const annotationContainer = document.getElementById("annotation-container") as any;
const displayCountDiv = document.getElementById("display-count") as any;
const noResultsDiv = document.getElementById("no-results") as any;
const tagsListContainer = document.getElementById("tags-list") as any;
const colorsListContainer = document.getElementById("colors-list") as any;

let selectedTags = new Set<string>();
let selectedColors = new Set<string>();
let selectedAnnotationIds = new Set<number>();

(function ensureTagArrayHelper() {
  // Normalize tag field which may be an array (preferred), a JSON stringified array,
  // or a legacy comma-joined string.
})();
function asTagArray(tags: any): string[] {
  if (Array.isArray(tags)) {
    return (tags as any).filter((t: any) => typeof t === 'string' && t.trim() !== '').map((t: any) => t.trim());
  }
  if (tags == null) return [];
  if (typeof tags === 'string' && tags.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) {
        return (parsed as any).filter((t: any) => typeof t === 'string' && t.trim() !== '').map((t: any) => t.trim());
      }
    } catch { }
  }
  return String(tags).split(',').map((t: string) => t.trim()).filter(Boolean);
}

(function setupGlobalColorMenuCloser() {
  let bound = false;
  function closeIfOpen(e?: any) {
    const menu = document.querySelector('.color-menu') as any;
    if (!menu) return;
    if (e && (menu.contains(e.target) || (e.target && (e.target as any).closest('.annotation-color')))) return;
    menu.parentNode && menu.parentNode.removeChild(menu);
  }
  if (!bound) {
    bound = true;
    document.addEventListener('click', closeIfOpen, true);
    document.addEventListener('scroll', closeIfOpen, true);
    window.addEventListener('blur', closeIfOpen);
  }
})();

(function augmentStylesForContextMenu() {
  // no-op placeholder in case we later need runtime style tweaks
})();

// —— 刷新按钮逻辑 ——
const refreshBtn = document.getElementById("refresh-btn");
const refreshBtnText = document.getElementById("refresh-btn-text");

if (refreshBtn && refreshBtnText) {
  refreshBtn.addEventListener("click", async () => {
    try {
      const parentZotero = (window as any).parent?.Zotero;
      if (parentZotero && parentZotero.AnnotationSummary && parentZotero.AnnotationSummary.extractAllAnnotations) {

        const originalText = refreshBtnText.textContent;
        refreshBtnText.textContent = "Loading...";
        (refreshBtn as any).disabled = true;

        const newUri = await parentZotero.AnnotationSummary.extractAllAnnotations();
        if (newUri) {
          await loadAnnotations(newUri);
        }

        refreshBtnText.textContent = originalText;
        (refreshBtn as any).disabled = false;
      } else {
        console.error("无法调用 extractAllAnnotations");
      }
    } catch (e) {
      console.error("刷新失败", e);
      refreshBtnText.textContent = "Error";
      setTimeout(() => {
        if (refreshBtnText) {
          refreshBtnText.textContent = getString('refreshBtn');
          if (refreshBtn) (refreshBtn as any).disabled = false;
        }
      }, 2000);
    }
  });
}

// —— 主题切换功能 ——
const THEME_KEY = 'annotation-summary-theme';
type ThemeType = 'light' | 'dark' | 'beige' | 'green';
let currentThemeCache: ThemeType = 'light'; // 内存缓存

function getCurrentTheme(): ThemeType {
  try {
    // 尝试使用sessionStorage（Zotero环境中更可靠）
    const saved = sessionStorage.getItem(THEME_KEY) as ThemeType | null;
    if (saved && ['light', 'dark', 'beige', 'green'].includes(saved)) {
      currentThemeCache = saved;
      return saved;
    }
  } catch (e) {
    console.log('sessionStorage not available, using memory cache');
  }
  return currentThemeCache; // 回退到内存缓存
}

function setTheme(theme: ThemeType) {
  document.body.dataset.theme = theme;
  currentThemeCache = theme; // 总是更新内存缓存
  try {
    sessionStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    console.log('sessionStorage not available for theme storage');
  }
}

// 在DOMContentLoaded中初始化主题
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing theme...');

  // 初始化主题
  const initialTheme = getCurrentTheme();
  console.log('Initial theme:', initialTheme);
  setTheme(initialTheme);

  // 绑定主题选择器
  const themeSelector = document.getElementById('theme-selector') as HTMLSelectElement | null;
  console.log('Theme selector found:', !!themeSelector);
  if (themeSelector) {
    // 设置当前值
    themeSelector.value = initialTheme;

    // 监听变化
    themeSelector.addEventListener('change', (e) => {
      const newTheme = (e.target as HTMLSelectElement).value as ThemeType;
      console.log('Theme changed to:', newTheme);
      setTheme(newTheme);
    });
  }
});

// Heatmap state
let selectedHeatmapDates = new Set<string>();

async function loadAnnotations(fileUri?: string) {
  try {
    if (!fileUri) {
      const params = new URLSearchParams(window.location.search);
      fileUri = params.get("file") ? decodeURIComponent(params.get("file")!) : undefined;
    }

    if (fileUri) {
      console.log("loadAnnotations: 读取文件", fileUri);
      const parentZotero = (window as any).parent?.Zotero;
      if (!parentZotero) {
        console.warn("window.parent.Zotero 未定义");
        return;
      }

      try {
        // 使用 Zotero.File.getContents 读取文件
        // 需先构造 nsIFile
        const ioService = (window as any).Components.classes["@mozilla.org/network/io-service;1"]
          .getService((window as any).Components.interfaces.nsIIOService);
        const fileURL = ioService.newURI(fileUri, null, null)
          .QueryInterface((window as any).Components.interfaces.nsIFileURL);
        const nsIFile = fileURL.file;

        const jsonStr = await parentZotero.File.getContents(nsIFile);
        if (jsonStr) {
          const data = JSON.parse(jsonStr);
          if (Array.isArray(data)) {
            annotations = data;
            console.log("已加载注释，共", annotations.length, "条");
            renderCollectionsTree();
            updateCollectionsTriggerLabel();
            filterAnnotations();
            return;
          }
        }
      } catch (e) {
        console.error("读取临时文件出错：", e);
      }
    }
  } catch (e) {
    console.error("loadAnnotations 异常：", e);
  }
  // Fallback: 如果没有加载到数据或出错，仍执行一次渲染（可能是空状态）
  renderCollectionsTree();
  updateCollectionsTriggerLabel();
  filterAnnotations();
}

// 启动时自动加载
loadAnnotations();

// Listen to date preset change to clear heatmap selection
datePresetSelect.addEventListener('change', () => {
  if (datePresetSelect.value !== 'custom') {
    selectedHeatmapDates.clear();
    filterAnnotations();
  } else {
    // user manually selected custom? usually triggered by heatmap click
    // if user selects 'custom' manually but no dates selected, maybe clear heatmap?
    if (selectedHeatmapDates.size === 0) {
      datePresetSelect.value = 'all'; // reset if invalid
      filterAnnotations();
    }
  }
});


function filterAnnotations() {
  const presetVal = datePresetSelect.value;
  let dateStart: any = null;
  let dateEnd: any = null;

  const isCustomMode = presetVal === 'custom' && selectedHeatmapDates.size > 0;

  if (!isCustomMode && presetVal !== "all") {
    const days = parseInt(presetVal, 10);
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    dateStart = new Date(startDate.toISOString().slice(0, 10));
    const endDate = new Date(today.toISOString().slice(0, 10));
    endDate.setDate(endDate.getDate() + 1);
    endDate.setHours(23, 59, 59, 999);
    dateEnd = endDate;
  }

  const textQuery = textInput.value.trim().toLowerCase();
  const commentQuery = commentInput.value.trim().toLowerCase();
  const hasTextQuery = textQuery !== "";
  const hasCommentQuery = commentQuery !== "";
  const hasTagFilters = selectedTags.size > 0;
  const hasColorFilters = selectedColors.size > 0;
  // If custom mode, we use set check instead of range
  const hasDateFilter = isCustomMode || (dateStart !== null && dateEnd !== null);
  const hasCollectionFilter = selectedCollectionPaths.size > 0;

  function matchesCollection(a) {
    if (!hasCollectionFilter) return true;
    const paths = Array.isArray(a.collectionPaths) ? a.collectionPaths : [];
    for (const sel of selectedCollectionPaths) {
      if (paths.includes(sel)) return true;
    }
    return false;
  }

  function matchesDate(a) {
    if (!hasDateFilter) return true; // 'all' and no custom selection
    if (!a.dateAdded) return false;
    const d = new Date(a.dateAdded);

    if (isCustomMode) {
      const k = d.toISOString().slice(0, 10);
      return selectedHeatmapDates.has(k);
    } else {
      return d >= dateStart && d <= dateEnd;
    }
  }

  textResults = annotations.filter((a) => {
    if (!matchesDate(a)) return false;
    if (!matchesCollection(a)) return false;
    const txt = (a.text || "").toLowerCase();
    const cmt = (a.comment || "").toLowerCase();
    const matchText = hasTextQuery ? txt.includes(textQuery) : false;
    const matchComment = hasCommentQuery ? cmt.includes(commentQuery) : false;
    if (!hasTextQuery && !hasCommentQuery) return true;
    if (hasTextQuery && hasCommentQuery) return matchText && matchComment;
    return hasTextQuery ? matchText : matchComment;
  });

  let tagsSource = textResults;
  if (hasColorFilters) {
    tagsSource = textResults.filter((a) => (selectedColors as any).has(a.color));
  }

  let colorsSource = textResults;
  if (hasTagFilters) {
    colorsSource = textResults.filter((a) => {
      const arr = asTagArray(a.tags);
      if (tagOpSelect.value === "NOT") {
        if ((selectedTags as any).has("__NO_TAG__")) return arr.length > 0;
        return arr.every((t) => (selectedTags as any).has(t) === false);
      } else {
        if ((selectedTags as any).has("__NO_TAG__")) return arr.length === 0;
        if (arr.length === 0) return false;
        if (tagOpSelect.value === "AND") {
          return Array.from(selectedTags).every((t: any) => arr.includes(t as any));
        }
        return Array.from(selectedTags).some((t: any) => arr.includes(t as any));
      }
    });
  }

  bottomResults = annotations.filter((a) => {
    if (!matchesDate(a)) return false;
    if (!matchesCollection(a)) return false;
    let matchTag = true;
    if (hasTagFilters) {
      const arr = asTagArray(a.tags);
      if (tagOpSelect.value === "NOT") {
        if ((selectedTags as any).has("__NO_TAG__")) {
          matchTag = arr.length > 0;
          const otherTags = Array.from(selectedTags).filter((t: any) => t !== "__NO_TAG__");
          if (otherTags.some((t: any) => arr.includes(t as any))) matchTag = false;
        } else {
          matchTag = arr.every((t) => (selectedTags as any).has(t) === false);
        }
      } else {
        if ((selectedTags as any).has("__NO_TAG__")) {
          matchTag = arr.length === 0;
          const otherTags = Array.from(selectedTags).filter((t: any) => t !== "__NO_TAG__");
          if (otherTags.some((t: any) => arr.includes(t as any))) matchTag = true;
        } else if (arr.length === 0) {
          matchTag = false;
        } else if (tagOpSelect.value === "AND") {
          matchTag = Array.from(selectedTags).every((t: any) => arr.includes(t as any));
        } else {
          matchTag = Array.from(selectedTags).some((t: any) => arr.includes(t as any));
        }
      }
    }
    let matchColor = true;
    if (hasColorFilters) {
      if (colorOpSelect.value === "NOT") matchColor = !(selectedColors as any).has(a.color);
      else if (colorOpSelect.value === "AND") matchColor = selectedColors.size === 1 && (selectedColors as any).has(a.color);
      else matchColor = (selectedColors as any).has(a.color);
    }
    return matchTag && matchColor;
  });

  const textActive = hasTextQuery || hasCommentQuery;
  const bottomActive = hasTagFilters || hasColorFilters;
  if (!textActive && !bottomActive) {
    // optimized path
    combinedResults = annotations.filter((a) => matchesDate(a) && matchesCollection(a));
  } else if (textActive && !bottomActive) {
    combinedResults = textResults.slice();
  } else if (!textActive && bottomActive) {
    combinedResults = bottomResults.slice();
  } else if (textActive && bottomActive) {
    combinedResults = textResults.filter((a) => bottomResults.includes(a));
  }

  if (combinedResults.length === 0 && (selectedTags.size > 0 || selectedColors.size > 0)) {
    let allTags = new Set();
    let allColors = new Set();
    annotations.forEach(a => {
      asTagArray(a.tags).forEach((t: any) => (allTags as any).add(t));
      if (a.color) (allColors as any).add(a.color);
    });
    let tagGone = Array.from(selectedTags).every((t: any) => !(allTags as any).has(t) && t !== "__NO_TAG__");
    let colorGone = Array.from(selectedColors).every((c: any) => !(allColors as any).has(c));
    if ((selectedTags.size > 0 && tagGone) || (selectedColors.size > 0 && colorGone)) {
      selectedTags.clear();
      selectedColors.clear();
      textInput.value = "";
      commentInput.value = "";
      // Don't reset datePreset if it is custom
      if (datePresetSelect.value !== 'custom') {
        datePresetSelect.value = "all";
      }
      tagOpSelect.value = "OR";
      colorOpSelect.value = "OR";
      setTimeout(() => filterAnnotations(), 0);
      return;
    }
  }

  currentPage = 1;
  renderBottomOptions();
  renderAnnotations();
  renderStats();
}

function renderAnnotations() {
  annotationContainer.innerHTML = "";
  const perRow = Math.min(3, parseInt(itemsPerRowInput.value, 10) || 1);
  annotationContainer.style.gridTemplateColumns = `repeat(${perRow}, 1fr)`;
  // 标记当前每行列数，供样式控制悬停信息开关
  try {
    (annotationContainer as any).classList.remove('per-1', 'per-2', 'per-3');
    (annotationContainer as any).classList.add(`per-${perRow}`);
  } catch { }
  const perPage = parseInt(itemsPerPageSelect.value, 10) || 50;
  const totalCount = combinedResults.length;
  totalPages = Math.ceil(totalCount / perPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = startIndex + perPage;
  const pageResults = combinedResults.slice(startIndex, endIndex);
  noResultsDiv.style.display = pageResults.length === 0 ? "block" : "none";
  const textQueryRaw = textInput.value.trim();
  const commentQueryRaw = commentInput.value.trim();
  pageResults.forEach((a: any, idx: number) => {
    const wrapper = document.createElement("div");
    wrapper.className = "annotation-item";
    if (selectedAnnotationIds.has(a.itemID)) {
      (wrapper as any).style.boxShadow = "0 0 0 3px var(--secondary-color), 0 4px 12px rgba(0,0,0,0.12)";
      (wrapper as any).style.transform = "scale(1.01)";
      (wrapper as any).style.zIndex = 2;
      (wrapper as any).style.background = "#f0f7ff";
    } else {
      (wrapper as any).style.boxShadow = "var(--box-shadow)";
      (wrapper as any).style.transform = "none";
      // 移除硬编码白色背景，让CSS变量生效
      (wrapper as any).style.background = "";
      (wrapper as any).style.zIndex = 1;
    }
    if (a.uri) {
      (wrapper as any).style.cursor = "pointer";
      wrapper.addEventListener("dblclick", (e) => {
        e.preventDefault();
        window.location.assign(a.uri);
      });
    }
    const header = document.createElement("div");
    header.className = "annotation-header";
    const colorIndicator = document.createElement("div");
    colorIndicator.className = "annotation-color";
    (colorIndicator as any).style.backgroundColor = a.color || "#ccc";
    (colorIndicator as any).style.outline = selectedAnnotationIds.has(a.itemID) ? "3px solid var(--secondary-color)" : "none";
    (colorIndicator as any).style.outlineOffset = "2px";
    (colorIndicator as any).style.cursor = "pointer";
    colorIndicator.addEventListener("click", (e) => {
      e.stopPropagation();
      if (selectedAnnotationIds.has(a.itemID)) selectedAnnotationIds.delete(a.itemID);
      else selectedAnnotationIds.add(a.itemID);
      renderAnnotations();
    });
    colorIndicator.addEventListener("contextmenu", (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      openColorMenuForAnnotation(header, a.itemID);
    });
    header.appendChild(colorIndicator);
    wrapper.appendChild(header);

    const textDiv = document.createElement("div");
    textDiv.className = "annotation-text";
    (textDiv as any).innerHTML = sanitizeHtml(a.text || "");
    highlightInElement(textDiv, textQueryRaw);
    // 原文采用 quote 风格：按颜色加左侧竖线
    (textDiv as any).style.borderLeft = `3px solid ${a.color || "var(--accent-color)"}`;
    (textDiv as any).style.paddingLeft = '8px';
    wrapper.appendChild(textDiv);

    if (a.comment) {
      const commentDiv = document.createElement("div");
      commentDiv.className = "annotation-comment";
      (commentDiv as any).innerHTML = sanitizeHtml(a.comment);
      highlightInElement(commentDiv, commentQueryRaw);
      // 评论仅浅底色，不使用左侧竖线
      (commentDiv as any).style.borderLeft = '0';
      wrapper.appendChild(commentDiv);
    }

    const tagArr = asTagArray(a.tags);
    if (tagArr.length > 0) {
      const tagsContainer = document.createElement("div");
      tagsContainer.className = "annotation-tags";
      tagArr.forEach((tag: string) => {
        const tagElement = document.createElement("span");
        tagElement.className = "annotation-tag";
        (tagElement as any).textContent = tag;
        const delBtn = document.createElement("span");
        (delBtn as any).textContent = " ×";
        (delBtn as any).style.color = "#c0392b";
        (delBtn as any).style.cursor = "pointer";
        (delBtn as any).style.marginLeft = "4px";
        (delBtn as any).style.display = "none";
        tagElement.addEventListener("mouseenter", () => { (delBtn as any).style.display = "inline"; });
        tagElement.addEventListener("mouseleave", () => { (delBtn as any).style.display = "none"; });
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeTagFromAnnotation(a.itemID, tag, wrapper);
        });
        tagElement.appendChild(delBtn);
        tagsContainer.appendChild(tagElement);
      });
      wrapper.appendChild(tagsContainer);
    }

    if (a.uri) {
      const uriElement = document.createElement("div");
      uriElement.className = "annotation-uri";
      (uriElement as any).textContent = a.uri;
      wrapper.appendChild(uriElement);
    }

    if (a.sourceTitle || a.dateAdded) {
      const infoDiv = document.createElement("div");
      infoDiv.className = "annotation-hover-info";
      let infoText = "";
      if (a.sourceTitle) infoText += `${a.sourceTitle}`;
      if (a.dateAdded) {
        const date = new Date(a.dateAdded);
        const formatted = date.toLocaleString();
        infoText += (a.sourceTitle ? ` | ${formatted}` : formatted);
      }
      (infoDiv as any).textContent = infoText;
      wrapper.appendChild(infoDiv);
    }

    if (idx === 0) {
      const selectAllBtn = document.createElement("button");
      selectAllBtn.className = "select-all-btn";
      const allSelected = pageResults.every((item: any) => selectedAnnotationIds.has(item.itemID));
      (selectAllBtn as any).textContent = allSelected ? (LOCALE === 'zh-CN' ? '全不选' : 'Deselect All') : (LOCALE === 'zh-CN' ? '全选' : 'Select All');
      (selectAllBtn as any).style.position = "absolute";
      (selectAllBtn as any).style.right = "16px";
      (selectAllBtn as any).style.bottom = "12px";
      (selectAllBtn as any).style.display = "none";
      (selectAllBtn as any).style.zIndex = 10;
      (selectAllBtn as any).style.padding = "6px 16px";
      (selectAllBtn as any).style.borderRadius = "6px";
      (selectAllBtn as any).style.background = "var(--secondary-color)";
      (selectAllBtn as any).style.color = "#fff";
      (selectAllBtn as any).style.border = "none";
      (selectAllBtn as any).style.fontWeight = "600";
      (selectAllBtn as any).style.cursor = "pointer";
      selectAllBtn.addEventListener("mouseenter", () => {
        (selectAllBtn as any).style.display = "block";
      });
      selectAllBtn.addEventListener("mouseleave", () => {
        (selectAllBtn as any).style.display = "none";
      });
      selectAllBtn.addEventListener("click", () => {
        const allSelectedNow = pageResults.every((item: any) => selectedAnnotationIds.has(item.itemID));
        if (allSelectedNow) pageResults.forEach((item: any) => selectedAnnotationIds.delete(item.itemID));
        else pageResults.forEach((item: any) => selectedAnnotationIds.add(item.itemID));
        renderAnnotations();
      });
      wrapper.addEventListener("mousemove", (e) => {
        const rect = (wrapper as any).getBoundingClientRect();
        const x = (e as any).clientX - rect.left;
        const y = (e as any).clientY - rect.top;
        const btnRect = { left: (wrapper as any).offsetWidth - 120, top: (wrapper as any).offsetHeight - 40, right: (wrapper as any).offsetWidth, bottom: (wrapper as any).offsetHeight };
        if (x >= btnRect.left && x <= btnRect.right && y >= btnRect.top && y <= btnRect.bottom) (selectAllBtn as any).style.display = "block";
        else (selectAllBtn as any).style.display = "none";
      });
      wrapper.addEventListener("mouseleave", () => { (selectAllBtn as any).style.display = "none"; });
      wrapper.appendChild(selectAllBtn);
    }

    annotationContainer.appendChild(wrapper);
  });

  const count = combinedResults.length;
  if (LOCALE === "zh-CN") displayCountDiv.textContent = getString("displayCountZH").replace("{count}", count);
  else displayCountDiv.textContent = getString("displayCountEN").replace("{count}", count);
  prevPageButton.disabled = currentPage <= 1;
  nextPageButton.disabled = currentPage >= totalPages;
  const infoTemplate = getString("pageInfo");
  pageInfoSpan.textContent = infoTemplate.replace("{current}", currentPage).replace("{total}", totalPages);
}

function renderBottomOptions() {
  tagsListContainer.innerHTML = "";
  colorsListContainer.innerHTML = "";
  const hasTagFilters = selectedTags.size > 0;
  const hasColorFilters = selectedColors.size > 0;
  const colorsBase = textResults.filter((a) => {
    if (!hasTagFilters) return true;
    const arr = asTagArray(a.tags);
    if (tagOpSelect.value === "NOT") {
      if ((selectedTags as any).has("__NO_TAG__")) return arr.length > 0;
      return arr.every((t) => !(selectedTags as any).has(t));
    }
    if (tagOpSelect.value === "AND") return Array.from(selectedTags).every((t: any) => arr.includes(t as any));
    if ((selectedTags as any).has("__NO_TAG__")) return arr.length === 0;
    return Array.from(selectedTags).some((t: any) => arr.includes(t as any));
  });
  const tagsBase = textResults.filter((a) => {
    if (!hasColorFilters) return true;
    if (colorOpSelect.value === "NOT") return !(selectedColors as any).has(a.color);
    if (colorOpSelect.value === "AND") return selectedColors.size === 1 && (selectedColors as any).has(a.color);
    return (selectedColors as any).has(a.color);
  });
  const colorSource = colorOpSelect.value === "OR" ? colorsBase : combinedResults;
  const tagSource = tagOpSelect.value === "OR" ? tagsBase : combinedResults;
  const colorsSet = new Set(colorSource.map((a: any) => a.color).filter(Boolean));
  const tagsSet = new Set<string>();
  tagSource.forEach((a: any) => { asTagArray(a.tags).forEach((t: string) => tagsSet.add(t)); });
  const noTagValue = "__NO_TAG__";
  if (!(tagOpSelect.value === "NOT" && (selectedTags as any).has(noTagValue))) {
    const noTagEl = document.createElement("span");
    noTagEl.className = "tag-item";
    (noTagEl as any).textContent = getString("noTag");
    if (tagOpSelect.value !== "NOT" && (selectedTags as any).has(noTagValue)) noTagEl.classList.add("selected");
    noTagEl.addEventListener("click", () => {
      if ((selectedTags as any).has(noTagValue)) (selectedTags as any).delete(noTagValue);
      else (selectedTags as any).add(noTagValue);
      filterAnnotations();
    });
    tagsListContainer.appendChild(noTagEl);
  }
  Array.from(tagsSet).sort((a: any, b: any) => String(a).localeCompare(String(b), "zh-CN")).forEach((tag: any) => {
    if (tagOpSelect.value === "NOT" && (selectedTags as any).has(tag)) return;
    const tagEl = document.createElement("span");
    tagEl.className = "tag-item";
    (tagEl as any).textContent = tag;
    if ((selectedTags as any).has(tag)) tagEl.classList.add("selected");
    tagEl.addEventListener("click", () => {
      if ((selectedTags as any).has(tag)) (selectedTags as any).delete(tag);
      else (selectedTags as any).add(tag);
      filterAnnotations();
    });
    tagsListContainer.appendChild(tagEl);
  });
  Array.from(colorsSet).sort().forEach((col: any) => {
    if (colorOpSelect.value === "NOT" && (selectedColors as any).has(col)) return;
    const colEl = document.createElement("div");
    colEl.className = "color-item";
    (colEl as any).style.backgroundColor = col;
    if ((selectedColors as any).has(col)) colEl.classList.add("selected");
    colEl.addEventListener("click", () => {
      if ((selectedColors as any).has(col)) (selectedColors as any).delete(col);
      else (selectedColors as any).add(col);
      filterAnnotations();
    });
    colorsListContainer.appendChild(colEl);
  });
}

function renderCollectionsTree() {
  if (!collectionsTreeEl) return;
  const paths = new Set<string>();
  (annotations || []).forEach((a: any) => {
    (Array.isArray(a.collectionPaths) ? a.collectionPaths : []).forEach((p: any) => { if (p) paths.add(p); });
  });
  const root: any = { name: '', path: '', children: new Map() };
  Array.from(paths).forEach((p: any) => {
    const segs = String(p).split(' / ').filter(Boolean);
    let cursor = root;
    let acc = '';
    segs.forEach((seg, idx) => {
      acc = idx === 0 ? seg : acc + ' / ' + seg;
      if (!cursor.children.has(seg)) cursor.children.set(seg, { name: seg, path: acc, children: new Map() });
      cursor = cursor.children.get(seg);
    });
  });
  collectionsTreeEl.innerHTML = '';
  const ul = document.createElement('ul');
  collectionsTreeEl.appendChild(ul);
  function renderNodeMap(map: any, parentUL: any) {
    Array.from(map.keys()).sort((a: any, b: any) => String(a).localeCompare(String(b), 'zh-CN')).forEach((key: any) => {
      const node = map.get(key);
      const li = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      (cb as any).dataset.path = node.path;
      (cb as any).checked = selectedCollectionPaths.has(node.path);
      cb.addEventListener('change', () => {
        const checked = (cb as any).checked;
        toggleDescendants(li, checked);
        updateAncestors(li);
        updateCollectionsTriggerLabel();
        filterAnnotations();
      });
      const label = document.createElement('span');
      label.className = 'node-label';
      (label as any).textContent = node.name;
      (label as any).title = node.path || node.name || '';
      li.appendChild(cb);
      li.appendChild(label);
      if (node.children.size > 0) {
        li.classList.add('has-children');
        const childUL = document.createElement('ul');
        renderNodeMap(node.children, childUL);
        li.appendChild(childUL);
        label.addEventListener('click', (e: any) => {
          e.stopPropagation();
          li.classList.toggle('collapsed');
        });
      }
      parentUL.appendChild(li);
    });
  }
  renderNodeMap(root.children, ul);

  function toggleDescendants(li: any, checked: boolean) {
    const cb = li.querySelector('input[type="checkbox"]') as any;
    if (cb && cb.dataset.path) {
      if (checked) selectedCollectionPaths.add(cb.dataset.path);
      else selectedCollectionPaths.delete(cb.dataset.path);
      cb.checked = checked;
      cb.indeterminate = false;
    }
    const childCBs = li.querySelectorAll('ul input[type="checkbox"]') as any;
    childCBs.forEach((c: any) => {
      const path = c.dataset.path;
      c.checked = checked;
      c.indeterminate = false;
      if (path) {
        if (checked) selectedCollectionPaths.add(path);
        else selectedCollectionPaths.delete(path);
      }
    });
  }

  function updateAncestors(li: any) {
    let parent = li.parentElement;
    while (parent && parent !== collectionsTreeEl) {
      if (parent.tagName.toLowerCase() === 'ul') {
        const pli = parent.parentElement as any;
        if (pli && pli.tagName.toLowerCase() === 'li') {
          const checks = parent.querySelectorAll(':scope > li > input[type="checkbox"]') as any;
          let allChecked = true, anyChecked = false;
          checks.forEach((c: any) => {
            if (c.checked) anyChecked = true; else allChecked = false;
            if (c.indeterminate) { anyChecked = true; allChecked = false; }
          });
          const pcb = pli.querySelector(':scope > input[type="checkbox"]') as any;
          if (pcb) {
            if (allChecked) { pcb.checked = true; pcb.indeterminate = false; }
            else if (anyChecked) { pcb.checked = false; pcb.indeterminate = true; }
            else { pcb.checked = false; pcb.indeterminate = false; }
            const path = pcb.dataset.path;
            if (path) {
              if (pcb.checked) selectedCollectionPaths.add(path);
              else selectedCollectionPaths.delete(path);
            }
          }
          parent = pli.parentElement;
          continue;
        }
      }
      parent = parent.parentElement;
    }
  }
}

function toggleCollectionsPanel(show?: boolean) {
  if (!collectionsPanel) return;
  const target = (typeof show === 'boolean') ? show : (collectionsPanel.style.display !== 'block');
  collectionsPanel.style.display = target ? 'block' : 'none';
}
function updateCollectionsTriggerLabel() {
  if (!collectionsTrigger) return;
  if (selectedCollectionPaths.size === 0) {
    (collectionsTrigger as any).textContent = getString('collectionAll');
    return;
  }
  const arr = Array.from(selectedCollectionPaths).sort((a: any, b: any) => String(a).localeCompare(String(b), 'zh-CN'));
  if (arr.length <= 2) (collectionsTrigger as any).textContent = (arr as any).join(', ');
  else (collectionsTrigger as any).textContent = (arr as any)[0] + ` +${(arr as any).length - 1}`;
}
collectionsTrigger && collectionsTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCollectionsPanel();
});
document.addEventListener('click', (e) => {
  if (!collectionsPanel) return;
  if (collectionsPanel.style.display !== 'block') return;
  const within = collectionsPanel.contains(e.target as any) || collectionsTrigger.contains(e.target as any);
  if (!within) toggleCollectionsPanel(false);
});

function renderHistogram(container: any, data: any, isColor = false) {
  container.innerHTML = "";
  if (Object.keys(data).length === 0) {
    container.innerHTML = '<div class="no-data">' + getString('noData') + '</div>';
    return;
  }
  const keys = Object.keys(data);
  const maxVal = Math.max(...Object.values(data) as any);
  keys.sort((a: any, b: any) => (data[b] - data[a]) || a.localeCompare(b, 'zh-CN'));
  keys.forEach((key: any) => {
    const val = (data as any)[key];
    const row = document.createElement('div');
    row.className = 'histogram-row';
    const labelSection = document.createElement('div');
    labelSection.className = 'label-section';
    if (isColor) {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      (swatch as any).style.backgroundColor = key;
      labelSection.appendChild(swatch);
    }
    const labelText = document.createElement('span');
    labelText.className = 'label-text';
    (labelText as any).textContent = key;
    labelSection.appendChild(labelText);
    row.appendChild(labelSection);
    const barContainer = document.createElement('div');
    barContainer.className = 'bar-container';
    const bar = document.createElement('div');
    bar.className = 'bar';
    (bar as any).style.backgroundColor = isColor ? key : '#5c6bc0';
    (bar as any).style.width = `${(val / maxVal) * 100}%`;
    barContainer.appendChild(bar);
    row.appendChild(barContainer);
    const count = document.createElement('div');
    count.className = 'count';
    (count as any).textContent = val;
    row.appendChild(count);
    container.appendChild(row);
  });
}

function renderStats() {
  const colorCounts: any = {};
  const tagCounts: any = {};
  combinedResults.forEach((a: any) => {
    if (a.color) colorCounts[a.color] = (colorCounts[a.color] || 0) + 1;
    asTagArray(a.tags).forEach((t: string) => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });
  const colorHist = document.getElementById('color-histogram') as any;
  renderHistogram(colorHist, colorCounts, true);
  const tagHist = document.getElementById('tag-histogram') as any;
  renderHistogram(tagHist, tagCounts, false);

  // Render Heatmap
  const heatmapContainer = document.getElementById('study-heatmap');
  if (heatmapContainer) renderHeatmap(heatmapContainer, annotations);
}

function renderHeatmap(container: HTMLElement, data: any[]) {
  container.innerHTML = '';

  const countMap = new Map<string, number>();
  const today = new Date();
  const endDate = new Date(today);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 364);

  data.forEach((a: any) => {
    if (a.dateAdded) {
      const d = new Date(a.dateAdded);
      const k = d.toISOString().slice(0, 10);
      countMap.set(k, (countMap.get(k) || 0) + 1);
    }
  });

  const dates = [];
  let current = new Date(startDate);
  const dayOfWeek = current.getDay();
  current.setDate(current.getDate() - dayOfWeek);

  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';

  dates.forEach(date => {
    const k = date.toISOString().slice(0, 10);
    const count = countMap.get(k) || 0;

    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';

    let level = 0;
    if (count > 0) level = 1;
    if (count > 2) level = 2;
    if (count > 5) level = 3;
    if (count > 10) level = 4;

    cell.setAttribute('data-level', String(level));
    // cell.setAttribute('data-title', `${k}: ${count} annotations`); // Removed for custom tooltip
    cell.setAttribute('data-date', k);

    if (selectedHeatmapDates.has(k)) {
      cell.classList.add('selected');
    }

    // Custom Tooltip Logic
    cell.addEventListener('mouseenter', () => {
      const tooltip = document.getElementById('global-tooltip');
      if (tooltip) {
        tooltip.textContent = `${k}: ${count} annotations`;
        tooltip.style.display = 'block';
      }
    });
    cell.addEventListener('mousemove', (e) => {
      const tooltip = document.getElementById('global-tooltip');
      if (tooltip) {
        tooltip.style.left = e.clientX + 'px';
        tooltip.style.top = e.clientY + 'px';
      }
    });
    cell.addEventListener('mouseleave', () => {
      const tooltip = document.getElementById('global-tooltip');
      if (tooltip) tooltip.style.display = 'none';
    });

    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (selectedHeatmapDates.has(k)) {
        selectedHeatmapDates.delete(k);
        cell.classList.remove('selected');
      } else {
        selectedHeatmapDates.add(k);
        cell.classList.add('selected');
      }

      if (selectedHeatmapDates.size > 0) {
        const customOpt = document.getElementById('date-preset-custom') as HTMLOptionElement;
        if (customOpt) customOpt.disabled = false;
        datePresetSelect.value = 'custom';
      } else {
        // Revert to all if cleared
        datePresetSelect.value = 'all';
        const customOpt = document.getElementById('date-preset-custom') as HTMLOptionElement;
        if (customOpt) customOpt.disabled = true;
      }

      filterAnnotations();
    });

    grid.appendChild(cell);
  });

  container.appendChild(grid);

  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  legend.innerHTML = `
    <span>Less</span>
    <span class="legend-cell" style="background-color: #ebedf0"></span>
    <span class="legend-cell" style="background-color: #9be9a8"></span>
    <span class="legend-cell" style="background-color: #40c463"></span>
    <span class="legend-cell" style="background-color: #30a14e"></span>
    <span class="legend-cell" style="background-color: #216e39"></span>
    <span>More</span>
  `;
  container.appendChild(legend);
}

async function removeTagFromAnnotation(itemID: number, tagToRemove: string, wrapper: any) {
  try {
    const item = await (window as any).parent.Zotero.Items.get(itemID);
    if (!item) throw new Error("未找到 itemID=" + itemID);
    const existingTagObjs = item.getTags();
    const existingTags = existingTagObjs.map((tObj: any) => tObj.tag);
    const newTagNames = existingTags.filter((t: any) => t !== tagToRemove);
    item.setTags(newTagNames.map((t: any) => ({ tag: t })));
    await item.saveTx();
    (window as any).parent.Zotero.Notifier.trigger("item", "modify", itemID);
    const idx = annotations.findIndex((a: any) => a.itemID === itemID);
    if (idx >= 0) {
      (annotations as any)[idx].tags = newTagNames;
    }
    const tagsContainer = wrapper.querySelector(".annotation-tags") as any;
    tagsContainer.querySelectorAll(".annotation-tag").forEach((el: any) => el.remove());
    tagsContainer.querySelectorAll(".add-tag-wrapper").forEach((el: any) => el.remove());
    newTagNames.forEach((t: any) => {
      const tagEl = document.createElement("span");
      tagEl.className = "annotation-tag";
      (tagEl as any).textContent = t;
      const delBtn = document.createElement("span");
      (delBtn as any).textContent = " ×";
      (delBtn as any).style.cursor = "pointer";
      (delBtn as any).style.color = "#c0392b";
      (delBtn as any).style.marginLeft = "4px";
      (delBtn as any).style.display = "none";
      tagEl.addEventListener("mouseenter", () => { (delBtn as any).style.display = "inline"; });
      tagEl.addEventListener("mouseleave", () => { (delBtn as any).style.display = "none"; });
      delBtn.addEventListener("click", (e: any) => { e.stopPropagation(); removeTagFromAnnotation(itemID, t, wrapper); });
      tagEl.appendChild(delBtn);
      tagsContainer.appendChild(tagEl);
    });
    filterAnnotations();
  } catch (e) {
    console.error("删除标签失败：", e);
    alert("删除标签出错，请检查控制台错误信息。");
  }
}

textInput.addEventListener("input", filterAnnotations);
commentInput.addEventListener("input", filterAnnotations);
itemsPerRowInput.addEventListener("change", renderAnnotations);
itemsPerPageSelect.addEventListener("change", () => { currentPage = 1; renderAnnotations(); });
datePresetSelect.addEventListener("change", filterAnnotations);
tagOpSelect.addEventListener("change", () => { selectedTags.clear(); filterAnnotations(); });
colorOpSelect.addEventListener("change", () => { selectedColors.clear(); filterAnnotations(); });
prevPageButton.addEventListener("click", () => { if (currentPage > 1) { currentPage--; renderAnnotations(); } });
nextPageButton.addEventListener("click", () => { if (currentPage < totalPages) { currentPage++; renderAnnotations(); } });

const batchTagInput = document.getElementById("batch-tag-input") as any;
const batchTagSuggestions = document.getElementById("batch-tag-suggestions") as any;
const batchAddTagBtn = document.getElementById("batch-add-tag-btn") as any;

function getCurrentTagSuggestions() {
  const tagsSet = new Set<string>();
  combinedResults.forEach((a: any) => {
    asTagArray(a.tags).forEach((t: string) => tagsSet.add(t));
  });
  return Array.from(tagsSet).sort((a, b) => a.localeCompare(b, "zh-CN"));
}
function renderBatchTagSuggestions(filter = "") {
  const suggestions = getCurrentTagSuggestions().filter((t: any) => t.includes(filter));
  if (suggestions.length === 0) { (batchTagSuggestions as any).style.display = "none"; return; }
  batchTagSuggestions.innerHTML = "";
  suggestions.forEach((tag: any) => {
    const item = document.createElement("div");
    (item as any).textContent = tag;
    (item as any).style.padding = "8px 12px";
    (item as any).style.cursor = "pointer";
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      batchTagInput.value = tag;
      (batchTagSuggestions as any).style.display = "none";
    });
    batchTagSuggestions.appendChild(item);
  });
  (batchTagSuggestions as any).style.display = "block";
}
batchTagInput.addEventListener("focus", () => { renderBatchTagSuggestions(batchTagInput.value.trim()); });
batchTagInput.addEventListener("input", () => { renderBatchTagSuggestions(batchTagInput.value.trim()); });
batchTagInput.addEventListener("blur", () => { setTimeout(() => { (batchTagSuggestions as any).style.display = "none"; }, 150); });
batchAddTagBtn.addEventListener("click", async () => {
  const tag = batchTagInput.value.trim();
  if (!tag) { alert("请输入要添加的标签"); return; }
  if (selectedAnnotationIds.size === 0) { alert("请先选中要添加标签的批注"); return; }
  (batchAddTagBtn as any).disabled = true;
  for (const itemID of selectedAnnotationIds) {
    try {
      const item = await (window as any).parent.Zotero.Items.get(itemID);
      if (!item) continue;
      const existingTagObjs = item.getTags();
      const existingTags = existingTagObjs.map((tObj: any) => tObj.tag);
      if (!existingTags.includes(tag)) {
        existingTags.push(tag);
        item.setTags(existingTags.map((t: any) => ({ tag: t })));
        await item.saveTx();
        (window as any).parent.Zotero.Notifier.trigger("item", "modify", itemID);
        const idx = annotations.findIndex((a: any) => a.itemID === itemID);
        if (idx >= 0) {
          const current = (annotations as any)[idx].tags;
          const arr = Array.isArray(current) ? [...current] : asTagArray(current);
          if (!arr.includes(tag)) arr.push(tag);
          (annotations as any)[idx].tags = arr;
        }
      }
    } catch (e) { console.error("添加标签失败", itemID, e); }
  }
  (batchAddTagBtn as any).disabled = false;
  batchTagInput.value = "";
  selectedAnnotationIds.clear();
  filterAnnotations();
});

function getCurrentColorOptions() {
  const counts: Record<string, number> = {};
  (annotations).forEach((a: any) => {
    const c = a.color;
    if (!c) return;
    counts[c] = (counts[c] || 0) + 1;
  });
  const sorted = Object.keys(counts).sort((a, b) => {
    if (counts[b] !== counts[a]) return counts[b] - counts[a];
    return String(a).localeCompare(String(b), 'zh-CN');
  });
  return sorted.slice(0, 20);
}

async function changeAnnotationColor(itemID: number, newColor: string) {
  try {
    const item = await (window as any).parent.Zotero.Items.get(itemID);
    if (!item) throw new Error("未找到 itemID=" + itemID);
    (item as any).annotationColor = newColor;
    await item.saveTx();
    (window as any).parent.Zotero.Notifier.trigger("item", "modify", itemID);
    const idx = annotations.findIndex((a: any) => a.itemID === itemID);
    if (idx >= 0) {
      (annotations as any)[idx].color = newColor;
    }
    filterAnnotations();
  } catch (e) {
    console.error("修改颜色失败：", e);
    alert("修改颜色出错，请检查控制台错误信息。");
  }
}

function openColorMenuForAnnotation(containerEl: HTMLElement, itemID: number) {
  // 关闭已有菜单
  const existed = containerEl.querySelector('.color-menu') as any;
  if (existed && existed.parentNode) existed.parentNode.removeChild(existed);
  const docMenu = document.querySelector('.color-menu') as any;
  if (docMenu && docMenu.parentNode) docMenu.parentNode.removeChild(docMenu);

  const menu = document.createElement('div');
  menu.className = 'color-menu';

  const colors = getCurrentColorOptions();
  if (colors.length === 0) {
    const none = document.createElement('div');
    (none as any).textContent = LOCALE === 'zh-CN' ? '无可用颜色' : 'No colors';
    (none as any).style.fontSize = '12px';
    (none as any).style.color = '#888';
    (none as any).style.padding = '4px 6px';
    menu.appendChild(none);
  } else {
    colors.forEach((col: any) => {
      const opt = document.createElement('div');
      opt.className = 'color-option';
      (opt as any).style.backgroundColor = col;
      opt.addEventListener('mousedown', async (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        await changeAnnotationColor(itemID, col);
        menu.parentNode && menu.parentNode.removeChild(menu);
      });
      menu.appendChild(opt);
    });
  }

  // 挂到 header 上，按 CSS 相对定位
  containerEl.appendChild(menu);
}


