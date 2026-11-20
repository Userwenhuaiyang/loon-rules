WidgetMetadata = {
  id: "zjlt-iptv",
  title: "浙江联通 IPTV",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  detailCacheDuration: 0,
  description: "浙江联通内网 IPTV（itv.aptv.app/zjlt.m3u）：央视、卫视、浙江本地频道，直接播放。仅在联通宽带下可用。",
  author: "Sunny",
  modules: [
    { id: "channels", title: "浙江联通 · 直播频道", functionName: "loadChannels", cacheDuration: 0, params: [
      { name: "group", title: "分组", type: "enumeration", value: "", enumOptions: [
        { title: "全部", value: "" },
        { title: "央视频道", value: "央视" },
        { title: "卫视频道", value: "卫视" },
        { title: "浙江本地", value: "浙江" },
        { title: "其他", value: "其他" }
      ] },
      { name: "page", title: "页码", type: "page" }
    ] },
    { id: "searchChannels", title: "浙江联通 · 搜频道", functionName: "search", cacheDuration: 0, params: [
      { name: "keyword", title: "频道名关键词", type: "input" },
      { name: "page", title: "页码", type: "page" }
    ] }
  ],
  globalParams: [
    { name: "m3u_url", title: "订阅地址", type: "input", value: "https://itv.aptv.app/china-iptv/zjlt.m3u", description: "浙江联通内网 m3u 订阅源，仅在联通宽带下可访问。失效时可换成你自己的 m3u 地址。" }
  ],
  search: {
    title: "搜索浙江联通频道",
    functionName: "search",
    params: [
      { name: "keyword", title: "频道名关键词", type: "input" },
      { name: "page", title: "页码", type: "page" }
    ]
  }
};

var ZJLT_DEFAULT_M3U = "https://itv.aptv.app/china-iptv/zjlt.m3u";
var ZJLT_LINK_PREFIX = "zjlt:";
var ZJLT_PAGE_SIZE = 50;

function zjltText(x) {
  return x == null ? "" : String(x);
}

function zjltM3uUrl(p) {
  var u = (p && typeof p.m3u_url === "string" && p.m3u_url.trim()) || ZJLT_DEFAULT_M3U;
  return u.replace(/\/+$/, "");
}

function zjltAttr(line, name) {
  var m = line.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : "";
}

function zjltParseM3u(text) {
  var lines = String(text || "").split(/\r?\n/);
  var channels = [];
  var current = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (line.indexOf("#EXTINF") === 0) {
      var comma = line.lastIndexOf(",");
      var name = comma >= 0 ? line.slice(comma + 1).trim() : "";
      current = {
        name: name,
        tvgId: zjltAttr(line, "tvg-id"),
        tvgName: zjltAttr(line, "tvg-name"),
        logo: zjltAttr(line, "tvg-logo"),
        group: zjltAttr(line, "group-title") || "其他",
        url: ""
      };
    } else if (line.charAt(0) !== "#" && current) {
      current.url = line;
      if (current.name && current.url) channels.push(current);
      current = null;
    }
  }
  return channels;
}

function zjltGroupKey(group) {
  var g = zjltText(group);
  if (/央视|CCTV/i.test(g)) return "央视";
  if (/卫视/i.test(g)) return "卫视";
  if (/浙江|杭州|宁波|温州|绍兴|湖州|嘉兴|金华|衢州|台州|丽水|舟山/i.test(g)) return "浙江";
  return "其他";
}

function zjltEncode(info) {
  return ZJLT_LINK_PREFIX + encodeURIComponent(JSON.stringify(info));
}

function zjltDecode(link) {
  try {
    if (typeof link !== "string" || link.indexOf(ZJLT_LINK_PREFIX) !== 0) return null;
    return JSON.parse(decodeURIComponent(link.slice(ZJLT_LINK_PREFIX.length)));
  } catch (e) {
    return null;
  }
}

var zjltCache = { url: "", channels: null };

async function zjltChannels(p) {
  var url = zjltM3uUrl(p);
  if (zjltCache.url === url && zjltCache.channels) return zjltCache.channels;
  var res = await Widget.http.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      "Accept": "*/*"
    },
    timeout: 20000
  });
  var status = Number(res && (res.statusCode || res.status) || 0);
  if (status >= 300) throw new Error("订阅源 HTTP " + status + "（仅联通宽带可访问）");
  var data = res && res.data;
  var text = typeof data === "string" ? data : (data != null ? String(data) : "");
  if (!text || text.indexOf("#EXTM3U") < 0) throw new Error("订阅源返回的不是 m3u（仅联通宽带可访问）");
  var channels = zjltParseM3u(text);
  if (!channels.length) throw new Error("订阅源里没有解析到频道");
  zjltCache = { url: url, channels: channels };
  return channels;
}

function zjltCard(ch) {
  var logo = zjltText(ch.logo);
  return {
    id: "zjlt-" + encodeURIComponent(ch.name),
    type: "url",
    mediaType: "tv",
    title: ch.name,
    posterPath: logo,
    coverUrl: logo,
    backdropPath: logo,
    description: zjltText(ch.group),
    link: zjltEncode({ name: ch.name, url: ch.url, logo: logo, group: ch.group })
  };
}

function zjltPage(list, page) {
  var p = Number(page || 1);
  if (!Number.isInteger(p) || p < 1) p = 1;
  var start = (p - 1) * ZJLT_PAGE_SIZE;
  return list.slice(start, start + ZJLT_PAGE_SIZE);
}

async function loadChannels(p) {
  p = p || {};
  var all = await zjltChannels(p);
  var group = zjltText(p.group);
  var list = all;
  if (group) {
    list = all.filter(function (ch) { return zjltGroupKey(ch.group) === group; });
    if (!list.length && group === "其他") {
      list = all.filter(function (ch) { return zjltGroupKey(ch.group) === "其他"; });
    }
  }
  return zjltPage(list, p.page).map(zjltCard);
}

async function search(p) {
  p = p || {};
  var keyword = zjltText(p.keyword).trim();
  if (!keyword) return [];
  var all = await zjltChannels(p);
  var list = all.filter(function (ch) {
    var hay = [ch.name, ch.tvgName, ch.tvgId, ch.group].map(zjltText).join(" ");
    return hay.indexOf(keyword) >= 0;
  });
  return zjltPage(list, p.page).map(zjltCard);
}

async function loadDetail(link) {
  if (typeof link === "object" && link) link = link.link;
  var info = zjltDecode(link);
  if (!info || !info.url) return null;
  var logo = zjltText(info.logo);
  return [{
    id: "zjlt-" + encodeURIComponent(info.name),
    type: "url",
    mediaType: "tv",
    title: zjltText(info.name),
    posterPath: logo,
    coverUrl: logo,
    backdropPath: logo,
    description: zjltText(info.group),
    videoUrl: info.url,
    link: link,
    episodeItems: [],
    relatedItems: []
  }];
}
