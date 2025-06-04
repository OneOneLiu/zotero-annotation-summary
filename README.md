# Zotero Annotation Summary

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-round&logo=github)](https://github.com/windingwind/zotero-plugin-template)
[![Latest release](https://img.shields.io/github/v/release/OneOneLiu/zotero-annotation-summary)](https://github.com/OneOneLiu/zotero-annotation-summary/releases)
![Release Date](https://img.shields.io/github/release-date/OneOneLiu/zotero-annotation-summary?color=9cf)
[![License](https://img.shields.io/github/license/OneOneLiu/zotero-annotation-summary)](https://github.com/OneOneLiu/zotero-annotation-summary/blob/master/LICENSE)
![Downloads latest release](https://img.shields.io/github/downloads/OneOneLiu/zotero-annotation-summary/latest/total?color=yellow)

> [简体中文](./README.md) | [English](./README_en.md)

## 简介

一个用于在 Zotero 中提取，显示文库中所有标注的插件。 可以加载并展示文库中的所有标注，支持按检索词检索、按颜色/标签过滤、鼠标悬浮预览来源和时间、点击直接跳转以及简易数据统计功能。

## 使用方式

- 安装[Release](https://github.com/OneOneLiu/zotero-annotation-summary/releases)中的`annotation-summary.xpi`插件到Zotero 7
- 在 Zotero 顶部菜单栏，工具->打开标注总结

<img src="./doc/images/how__to_use.png" alt="how_to_use" width="500">

## 功能

- 将从 Zotero 中的高亮标注加载并展示到一个总结页面中。

<img src="./doc/images/introduction.png" alt="introduction" width="800">

### 2. 搜索与过滤

- 按标注高亮内容或评论关键字搜索。
- 可选与或非逻辑

<img src="./doc/images/indexing.gif" alt="indexing" width="800">

- 按标注颜色与标签进行二次筛选。

<img src="./doc/images/filtering.gif" alt="filtering" width="800">

- 颜色与标签筛选支持NOT逻辑，可以从所有标注数据中剔除某些颜色或者标签的数据，被剔除的颜色或者标签下方会显示红色线条

<img src="./doc/images/Not.png" alt="not" width="800">

- 支持按照日期过滤，过滤日期可选最近一天至一年，或者显示全部

<img src="./doc/images/daterange.png" alt="daterange" width="800">

### 3. 鼠标悬浮预览来源与时间

- 在鼠标悬停时，右上角浮层自动显示该标注的来源文献标题 (sourceTitle) 与添加时间 (dateAdded)。

<img src="./doc/images/source.png" alt="source" width="800">

### 4. 点击打开标注对应来源文献

- 点击任意标注条目会触发超链接，自动在 Zotero 中跳转到对应标注。

<img src="./doc/images/hyperlink.gif" alt="hyperlink" width="800">

### 5. 数据统计

- 标注数据窗格右下方显示当前显示的标注总条目

<img src="./doc/images/displaycount.png" alt="displaycount" width="800">

> [!note]
> 当标注条目过多时，第一次打开时，或者更改筛选条件，比如更改选中的颜色，tag，时间，与或非逻辑都会导致轻微卡顿，逻辑检索结束后的显示与阅读不会卡顿。我的电脑上实测标注条目大于1000条时才会出现轻微卡顿，超过2000条时出现明显卡顿。

- 页面下方显示color和tag的直方图数据统计

<img src="./doc/images/statistics.png" alt="statistics" width="800">

### 6. 动态渲染 UI

- 根据当前筛选状态，动态更新标注列表、可选标签，颜色面板，和数据统计。

## 许可证

本项目采用 **[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.en.html)** 许可证。详情请参阅 [LICENSE](https://github.com/OneOneLiu/zotero-annotation-summary/blob/master/LICENSE) 文件。

---

## 致谢

- 本项目基于 **[Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)** 构建  
- 本项目参考了 [Chartero](https://github.com/volatile-static/Chartero) 源码