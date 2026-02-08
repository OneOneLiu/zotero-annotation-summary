// @ts-nocheck
export const LOCALE = (navigator.language || (window as any).userLanguage || 'zh-CN')
  .toLowerCase()
  .startsWith('zh')
  ? 'zh-CN'
  : 'en-US';

const I18N = {
  'zh-CN': {
    annotationSummaryTitle: '标注总结',
    searchLabelText: '标注文本搜索:',
    searchLabelComment: '评论搜索:',
    searchPlaceholderText: '搜索标注文字...',
    searchPlaceholderComment: '搜索评论内容...',
    itemsPerRowLabel: '每行显示数量:',
    itemsPerPageLabel: '每页显示条数:',
    pagePrev: '上一页',
    pageNext: '下一页',
    pageInfo: '第 {current} / {total} 页',
    colorFilterLabel: '颜色筛选:',
    colorLogicLabel: '颜色逻辑:',
    tagFilterLabel: '标签筛选:',
    tagLogicLabel: '标签逻辑:',
    noResults: '没有找到匹配的批注',
    statsTitle: '统计分布',
    statsColor: '颜色分布',
    statsTag: '标签分布',
    statsHeatmap: '学习热力图',
    noTag: '无标签',
    noData: '暂无数据',
    daterangeLabel: '日期范围:',
    collectionFilterLabel: '文件夹筛选:',
    collectionAll: '全部文件夹',
    dateRangeAll: '全部时间',
    recent1day: '最近一天',
    recent3days: '最近三天',
    recent7days: '最近一周',
    recent30days: '最近一月',
    recent365days: '最近一年',
    dateRangeCustom: '自定义',
    displayCountZH: '共显示 {count} 条标注',
    batchTagInputPlaceholder: '输入标签',
    batchAddTagBtn: '添加标签',
    refreshBtn: '刷新',
    themeLabel: '主题:',
    themeLight: '亮色',
    themeDark: '暗色',
    themeBeige: '米色',
    themeGreen: '护眼绿',
    regexToggleTooltip: '点击启用正则表达式模式',
    regexToggleTooltipActive: '正则表达式模式已启用，点击关闭',
  },
  'en-US': {
    annotationSummaryTitle: 'Annotation Summary',
    searchLabelText: 'Annotation Text Search:',
    searchLabelComment: 'Comment Search:',
    searchPlaceholderText: 'Search annotation text...',
    searchPlaceholderComment: 'Search comment content...',
    itemsPerRowLabel: 'Items Per Row:',
    itemsPerPageLabel: 'Items Per Page:',
    pagePrev: 'Previous',
    pageNext: 'Next',
    pageInfo: 'Page {current} of {total}',
    colorFilterLabel: 'Color Filter:',
    colorLogicLabel: 'Color Logic:',
    tagFilterLabel: 'Tag Filter:',
    tagLogicLabel: 'Tag Logic:',
    noResults: 'No matching annotations found',
    statsTitle: 'Statistics',
    statsColor: 'Color Distribution',
    statsTag: 'Tag Distribution',
    statsHeatmap: 'Annotation Heatmap',
    noTag: 'No Tag',
    noData: 'No Data',
    daterangeLabel: 'Date Range:',
    collectionFilterLabel: 'Folder Filter:',
    collectionAll: 'All Collections',
    dateRangeAll: 'All',
    recent1day: 'Recent 1 Day',
    recent3days: 'Recent 3 Days',
    recent7days: 'Recent 7 Days',
    recent30days: 'Recent 1 Month',
    recent365days: 'Recent 1 Year',
    dateRangeCustom: 'Customize',
    displayCountEN: 'Displaying {count} annotations',
    pageTitle: 'AnnotationSummary',
    batchTagInputPlaceholder: 'Enter tag',
    batchAddTagBtn: 'Add Tag',
    refreshBtn: 'Refresh',
    themeLabel: 'Theme:',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeBeige: 'Beige',
    themeGreen: 'Eye-care Green',
    regexToggleTooltip: 'Click to enable regex mode',
    regexToggleTooltipActive: 'Regex mode enabled, click to disable',
  },
};

export function getString(key: string): string {
  return (I18N as any)[LOCALE][key] || (I18N as any)['en-US'][key] || key;
}

export function fillI18nText(): void {
  (document.documentElement as any).lang = LOCALE;
  const setText = (id: string, textKey: string, attr: 'textContent' | 'placeholder' = 'textContent') => {
    const el: any = document.getElementById(id);
    if (el) el[attr] = getString(textKey);
  };
  setText('page-title', 'pageTitle');
  setText('annotation-summary-title', 'annotationSummaryTitle');
  setText('label-text-search', 'searchLabelText');
  setText('text-search', 'searchPlaceholderText', 'placeholder');
  setText('label-comment-search', 'searchLabelComment');
  setText('comment-search', 'searchPlaceholderComment', 'placeholder');
  setText('label-items-per-row', 'itemsPerRowLabel');
  setText('label-items-per-page', 'itemsPerPageLabel');
  setText('prev-page', 'pagePrev');
  setText('next-page', 'pageNext');
  setText('label-color-filter', 'colorFilterLabel');
  setText('label-color-op', 'colorLogicLabel');
  setText('label-tag-filter', 'tagFilterLabel');
  setText('label-tag-op', 'tagLogicLabel');
  setText('stats-title', 'statsTitle');
  setText('stats-color', 'statsColor');
  setText('stats-tag', 'statsTag');
  setText('stats-heatmap', 'statsHeatmap');
  setText('no-results', 'noResults');
  setText('label-date-preset', 'daterangeLabel');
  setText('label-collection-filter', 'collectionFilterLabel');
  const all = document.getElementById('collection-all') as any;
  if (all) all.textContent = getString('collectionAll');
  setText('date-preset-all', 'dateRangeAll');
  setText('date-preset-1', 'recent1day');
  setText('date-preset-3', 'recent3days');
  setText('date-preset-7', 'recent7days');
  setText('date-preset-30', 'recent30days');
  setText('date-preset-365', 'recent365days');
  setText('date-preset-custom', 'dateRangeCustom');
  const input: any = document.getElementById('batch-tag-input');
  if (input) input.placeholder = getString('batchTagInputPlaceholder');
  setText('batch-add-tag-btn', 'batchAddTagBtn');
  setText('refresh-btn-text', 'refreshBtn');

  // 主题选择器
  setText('label-theme-selector', 'themeLabel');
  setText('theme-option-light', 'themeLight');
  setText('theme-option-dark', 'themeDark');
  setText('theme-option-beige', 'themeBeige');
  setText('theme-option-green', 'themeGreen');

  // 正则表达式切换按钮的 tooltip
  const textRegex = document.getElementById('text-regex-toggle');
  const commentRegex = document.getElementById('comment-regex-toggle');
  if (textRegex) textRegex.title = getString('regexToggleTooltip');
  if (commentRegex) commentRegex.title = getString('regexToggleTooltip');
}


