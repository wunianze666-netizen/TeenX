import { Bookmark, Eye, MessageCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { DemoCommunity as DemoCommunityData } from "../api";
import { PageFoot } from "./PageFoot";
import { Seg } from "./Seg";
import { TopNav } from "./TopNav";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

function topicFromForumPath(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = new URL(raw, "http://teenx.local");
    return parsed.origin === "http://teenx.local" ? parsed.searchParams.get("topic") : null;
  } catch {
    return null;
  }
}

export function DemoCommunity({ community }: { readonly community: DemoCommunityData }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [bookmarks, setBookmarks] = useState(() => new Set(community.bookmarks));
  const [searchParams, setSearchParams] = useSearchParams();
  const nestedPath = searchParams.get("path");
  const selectedTopicId = searchParams.get("topic") ?? topicFromForumPath(nestedPath);
  const categories = [
    { value: "all", label: "全部" },
    ...community.categories.map((item) => ({ value: item.id, label: item.name })),
  ];
  const visibleTopics = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return community.topics.filter((topic) => (
      (category === "all" || topic.categoryId === category)
      && (!needle || `${topic.title} ${topic.excerpt} ${topic.tags.join(" ")}`.toLocaleLowerCase("zh-CN").includes(needle))
    ));
  }, [category, community.topics, query]);

  function selectTopic(topicId: string) {
    const next = new URLSearchParams(searchParams);
    next.delete("path");
    if (selectedTopicId === topicId) next.delete("topic");
    else next.set("topic", topicId);
    setSearchParams(next, { replace: true });
  }

  function toggleBookmark(topicId: string) {
    setBookmarks((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }

  return (
    <div className="demo-community-page">
      <TopNav active="forum" />
      <main className="container demo-community-main">
        <header className="demo-community-head row-between">
          <div>
            <div className="row demo-community-kicker"><p className="eyebrow mb-0">Community</p><span className="pill pill-blue">本地演示</span></div>
            <h1 className="h2">社区</h1>
            <p className="lead">队伍作品、制作记录与互助讨论。</p>
          </div>
          <div className="demo-community-user">
            <span className="meta">当前身份</span>
            <strong>{community.currentUser.displayName}</strong>
            <small>@{community.currentUser.username}</small>
          </div>
        </header>

        <section className="demo-community-stats" aria-label="社区概览">
          <div><span className="meta">主题</span><strong>{community.stats.topicCount}</strong></div>
          <div><span className="meta">发言</span><strong>{community.stats.postCount}</strong></div>
          <div><span className="meta">收藏</span><strong>{bookmarks.size}</strong></div>
          <div><span className="meta">未读私信</span><strong>{community.stats.unreadMessages}</strong></div>
        </section>

        <div className="demo-community-toolbar">
          <Seg label="社区分类" options={categories} value={category} onChange={setCategory} />
          <label className="demo-community-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">搜索主题</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索主题" />
          </label>
        </div>

        <div className="demo-community-layout">
          <section className="card demo-topic-list" aria-live="polite">
            <div className="row-between demo-section-head">
              <div><p className="eyebrow">Latest</p><h2 className="h3">最新讨论</h2></div>
              <span className="meta">{visibleTopics.length} 个主题</span>
            </div>
            {visibleTopics.length === 0 ? <div className="empty">没有匹配的讨论。</div> : visibleTopics.map((topic) => {
              const selected = topic.id === selectedTopicId;
              const categoryName = community.categories.find((item) => item.id === topic.categoryId)?.name ?? "社区";
              return (
                <article className={`demo-topic-row ${selected ? "is-selected" : ""}`} key={topic.id}>
                  <button type="button" className="demo-topic-open" onClick={() => selectTopic(topic.id)} aria-expanded={selected}>
                    <span className="demo-topic-main">
                      <span className="row demo-topic-labels">
                        <span className="pill pill-dim">{categoryName}</span>
                        {topic.featured && <span className="pill">精选</span>}
                      </span>
                      <strong>{topic.title}</strong>
                      <span className="muted small">{topic.excerpt}</span>
                      <span className="row demo-topic-tags">{topic.tags.map((tag) => <span className="meta" key={tag}>#{tag}</span>)}</span>
                    </span>
                    <span className="demo-topic-meta">
                      <span>{topic.author}</span>
                      <span className="row"><MessageCircle size={14} aria-hidden="true" />{topic.replyCount}</span>
                      <span className="row"><Eye size={14} aria-hidden="true" />{topic.viewCount}</span>
                      <time>{formatDate(topic.createdAt)}</time>
                    </span>
                  </button>
                  {selected && (
                    <div className="demo-topic-expanded">
                      <p>{topic.excerpt}</p>
                      <button type="button" className={`btn btn-sm ${bookmarks.has(topic.id) ? "btn-secondary" : "btn-ghost"}`} onClick={() => toggleBookmark(topic.id)}>
                        <Bookmark size={15} aria-hidden="true" />
                        {bookmarks.has(topic.id) ? "已收藏" : "收藏"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>

          <aside className="card demo-category-panel">
            <p className="eyebrow">Channels</p>
            <h2 className="h3">讨论分区</h2>
            <div className="demo-category-list">
              {community.categories.map((item) => (
                <button type="button" key={item.id} onClick={() => setCategory(item.id)} className={category === item.id ? "is-active" : ""}>
                  <span>{item.name}</span><strong>{item.topicCount}</strong>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </main>
      <PageFoot />
    </div>
  );
}
